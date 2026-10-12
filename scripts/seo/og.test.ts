import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { GET, HEAD, selfHeaders } from "../../api/og";
import { assignSlugs, groupCostMap, type CostMap } from "./group";
import { buildModelView } from "./model-view";
import { cardElement } from "./og-card";
import { priceSentence } from "./copy";
import { modelCard, providerCard, writeCard } from "./og";
import { appShell } from "./shell";

const COST_MAP: CostMap = {
  "claude-opus-5-5": {
    litellm_provider: "anthropic",
    mode: "chat",
    input_cost_per_token: 4e-6,
    output_cost_per_token: 2e-5,
    max_input_tokens: 1_000_000,
    max_output_tokens: 128_000,
  },
  "anthropic.claude-opus-5-5": {
    litellm_provider: "bedrock_converse",
    mode: "chat",
    input_cost_per_token: 4e-6,
    output_cost_per_token: 2e-5,
  },
  "gemini/gemini-nano-banana-2.1": {
    litellm_provider: "gemini",
    mode: "image_generation",
    output_cost_per_image: 0.0336,
    max_input_tokens: 131072,
  },
  "rerank-v3.5": {
    litellm_provider: "cohere",
    mode: "rerank",
    input_cost_per_query: 0.002,
    input_cost_per_token: 0,
    output_cost_per_token: 0,
  },
  "gpt-image-1": {
    litellm_provider: "openai",
    mode: "image_generation",
    input_cost_per_token: 5e-6,
    output_cost_per_image_token: 4e-5,
  },
  "mistral/mistral-ocr-latest": {
    litellm_provider: "mistral",
    mode: "ocr",
    ocr_cost_per_page: 0.004,
  },
};

const view = (pageKey: string) => {
  const groups = groupCostMap(COST_MAP);
  const slugs = assignSlugs(groups);
  const g = groups.find((x) => x.pageKey === pageKey)!;
  return buildModelView(g, slugs.get(g.pageKey)!, {}, {}, null);
};

describe("share cards", () => {
  test("lead with the price, then context and max output", () => {
    expect(modelCard(view("claude-opus-5-5"))).toEqual({
      kicker: "Model pricing",
      title: "Claude Opus 5.5",
      subtitle: "by Anthropic · 2 providers on LiteLLM",
      stats: [
        { value: "$4 / $20", label: "per 1M input / output tokens" },
        { value: "1M", label: "context window" },
        { value: "128K", label: "max output" },
      ],
    });
  });

  test("image models show the per-image price and fill the last slot with providers", () => {
    const card = modelCard(view("gemini-nano-banana-2-1"));
    expect(card.stats).toEqual([
      { value: "$0.0336", label: "per image" },
      { value: "128K", label: "context window" },
      { value: "1", label: "provider" },
    ]);
  });

  test("cards price queries, image tokens and pages the way the page's own sentence does", () => {
    const lead = (pageKey: string) => modelCard(view(pageKey)).stats[0];
    expect(lead("rerank-v-3-5")).toEqual({
      value: "$2.00",
      label: "per 1K queries",
    });
    expect(lead("gpt-image-1")).toEqual({
      value: "$40",
      label: "per 1M output image tokens",
    });
    expect(lead("mistral-ocr")).toEqual({
      value: "$4.00",
      label: "per 1K pages",
    });
    for (const key of ["rerank-v-3-5", "gpt-image-1", "mistral-ocr"]) {
      const v = view(key);
      expect(priceSentence(v)).toContain(
        `${modelCard(v).stats[0].value.replace(/^\$(\d+)$/, "$$$1.00")} ${modelCard(v).stats[0].label}`,
      );
    }
  });

  test("writeCard stores the card and versions the image URL by its content", () => {
    const out = mkdtempSync(path.join(tmpdir(), "og-"));
    const a = writeCard(
      out,
      "providers",
      "bedrock",
      providerCard("Amazon Bedrock", 163, "Claude Opus 5.5"),
    );
    const b = writeCard(
      out,
      "providers",
      "bedrock",
      providerCard("Amazon Bedrock", 164, "Claude Opus 5.5"),
    );
    expect(a.url).toMatch(
      /^https:\/\/models\.litellm\.ai\/og\/providers\/bedrock\.png\?v=[0-9a-f]{10}$/,
    );
    expect(a.url).not.toBe(b.url);
    expect(
      JSON.parse(
        readFileSync(path.join(out, "og/providers/bedrock.json"), "utf8"),
      ).stats[0].value,
    ).toBe("164");
    expect(a.alt).toContain("163 models with pricing");
  });

  test("cards without stats have no stats row", () => {
    const el = cardElement(
      {
        kicker: "LiteLLM guardrails",
        title: "Custom code guardrails",
        stats: [],
      },
      "data:,",
    );
    expect((el.props.children as unknown[]).length).toBe(2);
  });
});

describe("image endpoint", () => {
  test("rejects anything that isn't a known kind and a slug-shaped id", async () => {
    for (const q of [
      "kind=etc&id=passwd",
      "kind=models&id=../secret",
      "kind=models&id=Bad%20Id",
      "kind=&id=",
    ]) {
      expect(
        (await GET(new Request(`https://models.litellm.ai/api/og?${q}`)))
          .status,
      ).toBe(404);
    }
  });
});

describe("image endpoint", () => {
  test("HEAD answers like GET without a body", async () => {
    const res = await HEAD(
      new Request("https://models.litellm.ai/api/og?kind=etc&id=passwd"),
    );
    expect(res.status).toBe(404);
    expect(res.body).toBeNull();
  });
});

describe("app route pages", () => {
  const index = `<!doctype html><html><head>
<title>Old</title>
<meta name="description" content="old" />
<link rel="canonical" href="https://models.litellm.ai/" />
<meta property="og:title" content="old" />
<meta property="og:description" content="old" />
<meta property="og:url" content="https://models.litellm.ai/" />
</head><body><div id="app"></div></body></html>`;
  const image = {
    url: "https://models.litellm.ai/og/pages/providers.png?v=abc",
    alt: "alt",
    width: 1200,
    height: 630,
  };

  test("get their own title, canonical, share image and no-JS summary, and re-running is safe", () => {
    const once = appShell(index, {
      path: "/providers",
      title: "Providers | LiteLLM",
      description: "d",
      image,
      noscript: "<p>hi</p>",
    });
    const twice = appShell(once, {
      path: "/providers",
      title: "Providers | LiteLLM",
      description: "d",
      image,
      noscript: "<p>hi</p>",
    });
    expect(twice).toBe(once);
    expect(once).toContain("<title>Providers | LiteLLM</title>");
    expect(once).toContain(
      '<link rel="canonical" href="https://models.litellm.ai/providers" />',
    );
    expect(once).toContain(
      '<meta name="twitter:card" content="summary_large_image">',
    );
    expect(once).toContain("<noscript><p>hi</p></noscript>");
  });
});

describe("self fetches", () => {
  test("forward only the Vercel session cookie and the bypass token", () => {
    const preview = new Request(
      "https://site-abc123-team.vercel.app/api/og?kind=models&id=x",
      {
        headers: {
          cookie: "a=1; _vercel_jwt=token.value; b=2",
          "x-vercel-protection-bypass": "secret",
        },
      },
    );
    expect(selfHeaders(preview)).toEqual({
      "x-vercel-protection-bypass": "secret",
      cookie: "_vercel_jwt=token.value",
    });
    expect(
      selfHeaders(
        new Request("https://models.litellm.ai/api/og?kind=models&id=x", {
          headers: { cookie: "a=1" },
        }),
      ),
    ).toEqual({});
  });
});
