import { describe, expect, test } from "vitest";
import middleware, {
  config as middlewareConfig,
  NOT_FOUND_PATH,
} from "../../middleware";
import vercel from "../../vercel.json";
import { cookbookPage, providersPage } from "./app-pages";
import { toolData } from "./compare-tool";
import { rangeMismatch } from "./consistency";
import {
  DOCS_SITEMAP_URL,
  frontmatter,
  loadCookbook,
  tutorialUrls,
} from "./cookbook";
import { headlinePrice, pageCopy } from "./copy";
import {
  assignSlugs,
  groupCostMap,
  type CostMap,
  type Overrides,
} from "./group";
import { fetchBytes, fetchText as fetchWithRetry } from "./fetch";
import { calcSection, calculatorBody, modelBody } from "./html";
import { modelMarkdown } from "./markdown";
import { buildModelView, modelStatus } from "./model-view";

const chat = (
  provider: string,
  input: number,
  output: number,
  extra: Record<string, unknown> = {},
) => ({
  litellm_provider: provider,
  mode: "chat",
  input_cost_per_token: input / 1e6,
  output_cost_per_token: output / 1e6,
  max_input_tokens: 200_000,
  ...extra,
});

function view(
  costMap: CostMap,
  pageKey: string,
  overrides: Overrides = {},
  today = "2026-10-20",
) {
  const groups = groupCostMap(costMap, overrides);
  const slugs = assignSlugs(groups, overrides);
  const g = groups.find((x) => x.pageKey === pageKey)!;
  return buildModelView(
    g,
    slugs.get(g.pageKey)!,
    overrides,
    {},
    "2026-09-01",
    today,
  );
}

const ctx = {
  buildDate: "2026-10-20",
  lastChanged: "2026-10-20",
  related: [],
  history: [],
  hubs: new Set<string>(),
};

describe("price range prose", () => {
  const costMap: CostMap = {
    "claude-opus-5-5": chat("anthropic", 4, 20),
    "anthropic.claude-opus-5-5": chat("bedrock_converse", 4, 20),
    "us-gov.anthropic.claude-opus-5-5": chat("bedrock_converse", 4.8, 24),
  };

  test("quotes the same rows the table renders, regional ones included", () => {
    const v = view(costMap, "claude-opus-5-5");
    const copy = pageCopy(v, "2026-10-20");
    expect(copy.answer).toContain("ranges from $4.00 to $4.80");
    const html = `<p>${copy.answer}</p>${modelBody(v, copy, ctx)}`;
    expect(rangeMismatch(html)).toBeNull();
  });

  test("fine-tuned listings are in the table but not in the quoted range", () => {
    const tuned: CostMap = {
      "o4-mini": chat("openai", 1.1, 4.4),
      "azure/o4-mini": chat("azure", 1, 4),
      "ft:o4-mini-2025-04-16": chat("openai", 4, 16),
    };
    const v = view(tuned, "o-4-mini");
    const copy = pageCopy(v, "2026-10-20");
    expect(copy.answer).toContain("ranges from $1.00 to $1.10");
    const html = `<p>${copy.answer}</p>${modelBody(v, copy, ctx)}`;
    expect(html).toContain("ft:o4-mini-2025-04-16");
    expect(rangeMismatch(html)).toBeNull();
  });

  test("a listing with a $0 input price and paid output starts the range at $0", () => {
    const zeroInput: CostMap = {
      "o4-mini": chat("openai", 1.1, 4.4),
      "vercel_ai_gateway/openai/o4-mini": chat("vercel_ai_gateway", 0, 4.4),
    };
    const v = view(zeroInput, "o-4-mini");
    const copy = pageCopy(v, "2026-10-20");
    expect(copy.answer).toContain("ranges from $0 to $1.10");
    const html = `<p>${copy.answer}</p>${modelBody(v, copy, ctx)}`;
    expect(rangeMismatch(html)).toBeNull();
  });

  test("the check fails when prose and table disagree", () => {
    const v = view(costMap, "claude-opus-5-5");
    const copy = pageCopy(v, "2026-10-20");
    const html = `<p>${copy.answer.replace("$4.80", "$4.40")}</p>${modelBody(v, copy, ctx)}`;
    expect(rangeMismatch(html)).toMatch(
      /prose says \$4\.00 to \$4\.40, table shows \$4 to \$4\.8/,
    );
  });
});

describe("providers page", () => {
  const support = {
    providers: {
      openai: {
        display_name: "OpenAI (`openai`)",
        url: "https://docs.litellm.ai/docs/providers/openai",
        endpoints: { chat_completions: true, embeddings: true },
      },
      anthropic: {
        display_name: "Anthropic (`anthropic`)",
        url: "https://docs.litellm.ai/docs/providers/anthropic",
        endpoints: { messages: true },
      },
      a2a: {
        display_name: "A2A (`a2a`)",
        endpoints: { chat_completions: true },
      },
    },
  };
  const hubs = [
    { hub: "openai", name: "OpenAI", count: 120 },
    { hub: "anthropic", name: "Anthropic", count: 40 },
  ];

  test("counts and lists every supported provider from the data", () => {
    const page = providersPage(support, hubs, "2026-10-20");
    expect(page.body).toContain("LiteLLM supports 3 AI providers");
    expect(page.body).toContain("2 of them have model prices");
    expect(page.body.match(/<tr><td>/g)).toHaveLength(3);
    expect(page.body).toContain('href="/providers/openai">120 models');
    expect(page.breadcrumbs.map((c) => c.name)).toEqual(["Home", "Providers"]);
  });

  test("the cookbook page's sitemap date is its newest guide", () => {
    const page = cookbookPage([
      {
        title: "Claude Code Quickstart",
        url: "https://docs.litellm.ai/x",
        date: "2026-01-15",
      },
    ]);
    expect(page.lastmod).toBe("2026-01-15");
  });
});

describe("/404", () => {
  test("answers with a real 404 instead of serving the page with 200", () => {
    const res = middleware(new Request("https://models.litellm.ai/404"));
    expect(new URL(res!.headers.get("x-middleware-rewrite")!).pathname).toBe(
      NOT_FOUND_PATH,
    );
  });

  test("leaves model pages alone unless an agent asks for markdown", () => {
    expect(
      middleware(new Request("https://models.litellm.ai/models/gpt-5")),
    ).toBeUndefined();
    const md = middleware(
      new Request("https://models.litellm.ai/models/gpt-5", {
        headers: { accept: "text/markdown" },
      }),
    );
    expect(new URL(md!.headers.get("x-middleware-rewrite")!).pathname).toBe(
      "/models/gpt-5.md",
    );
  });

  test("serves ranking and new-models pages as markdown, and their indexes as HTML", () => {
    const ask = (route: string) =>
      middleware(
        new Request(`https://models.litellm.ai${route}`, {
          headers: { accept: "text/markdown" },
        }),
      );
    for (const route of ["/rankings", "/rankings/", "/new-models", "/models"])
      expect(ask(route)).toBeUndefined();
    for (const route of [
      "/rankings/cheapest-chat-models",
      "/new-models/2023-10",
    ])
      expect(
        new URL(ask(route)!.headers.get("x-middleware-rewrite")!).pathname,
      ).toBe(`${route}.md`);
  });

  test("tells caches that every page served as markdown to agents varies by Accept", () => {
    const varies = vercel.headers
      .filter((rule) =>
        rule.headers.some((h) => h.key === "Vary" && h.value === "Accept"),
      )
      .map((rule) => new RegExp(`^${rule.source}$`));
    const sections = middlewareConfig.matcher.filter((m) =>
      m.endsWith("/:path*"),
    );
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections)
      expect(
        varies.some((rx) => rx.test(section.replace("/:path*", "/a-page"))),
      ).toBe(true);
  });

  test("serves the compare tools as HTML to agents, and comparisons as markdown", () => {
    const ask = (route: string) =>
      middleware(
        new Request(`https://models.litellm.ai${route}`, {
          headers: { accept: "text/markdown" },
        }),
      );
    expect(ask("/compare")).toBeUndefined();
    expect(ask("/compare/custom")).toBeUndefined();
    expect(
      new URL(
        ask("/compare/claude-opus-5-5-vs-gpt-6-astra")!.headers.get(
          "x-middleware-rewrite",
        )!,
      ).pathname,
    ).toBe("/compare/claude-opus-5-5-vs-gpt-6-astra.md");
  });
});

describe("introductory price", () => {
  const entry = {
    until: "2026-11-30",
    source: "https://ai.google.dev/gemini-api/docs/pricing",
  };

  test("shows only when the headline price comes from the seller it describes", () => {
    const resold: CostMap = {
      "openrouter/acme/acme-1": chat("openrouter", 2, 10),
    };
    expect(
      view(resold, "acme-1", { introPricing: { "acme-1": entry } }).intro,
    ).toBeUndefined();
    expect(
      view(resold, "acme-1", {
        introPricing: { "acme-1": { ...entry, providers: ["openrouter"] } },
      }).intro,
    ).toBeDefined();
    const direct: CostMap = { "gemini/gemini-4-argon": chat("gemini", 2, 10) };
    expect(
      view(direct, "gemini-4-argon", {
        introPricing: { "gemini-4-argon": entry },
      }).intro,
    ).toBeDefined();
  });
});

describe("per-output prices", () => {
  test("a model with $0 tokens but a per-clip price is not shown as free", () => {
    const lyria: CostMap = {
      "gemini/lyria-3.5": chat("gemini", 0, 0, { output_cost_per_image: 0.08 }),
    };
    const v = view(lyria, "lyria-3-5");
    expect(v.free).toBe(false);
    expect(headlinePrice(v)).toEqual({
      unit: "metric",
      value: 0.08,
      label: "per generation",
    });
    expect(pageCopy(v, "2026-10-20").title).toContain("$0.08 per Generation");
  });

  test("a title shows a per-token price only for chat and embedding models", () => {
    const tokenPriced: CostMap = {
      "gemini/acme-voice-tts": {
        litellm_provider: "gemini",
        mode: "audio_speech",
        input_cost_per_token: 5e-7,
        output_cost_per_token: 1e-5,
      },
      "acme-picture-1": {
        litellm_provider: "openai",
        mode: "image_generation",
        output_cost_per_image_token: 4e-5,
      },
      "acme-listen-1": {
        litellm_provider: "openai",
        mode: "audio_transcription",
        input_cost_per_token: 2e-6,
        output_cost_per_token: 1.2e-5,
      },
    };
    for (const key of ["acme-voice-tts", "acme-picture-1", "acme-listen-1"]) {
      expect(pageCopy(view(tokenPriced, key), "2026-10-20").title).toMatch(
        /API Pricing, Context Window & Providers/,
      );
    }
  });

  test("a model with $0 input but paid output is not shown as free", () => {
    const v = view(
      { "together_ai/acme/acme-2": chat("together_ai", 0, 4.4) },
      "acme-2",
    );
    expect(v.free).toBe(false);
  });

  test("a model with only $0 prices is still free", () => {
    const v = view({ "gemini/free-1": chat("gemini", 0, 0) }, "free-1");
    expect(v.free).toBe(true);
  });
});

describe("model status", () => {
  test("is retired only when every priced listing's date has passed", () => {
    expect(
      modelStatus([{ metric: 1 }], { deprecation: undefined }, "2026-10-20"),
    ).toBe("active");
    expect(
      modelStatus(
        [{ metric: 1, deprecation: "2026-12-01" }],
        { deprecation: "2026-12-01" },
        "2026-10-20",
      ),
    ).toBe("deprecated");
    expect(
      modelStatus(
        [{ metric: 1, deprecation: "2026-06-01" }],
        { deprecation: "2026-06-01" },
        "2026-10-20",
      ),
    ).toBe("retired");
  });

  test("one dated regional or snapshot listing doesn't deprecate a model that is still sold", () => {
    const rows = [{ metric: 1 }, { metric: 1, deprecation: "2026-06-01" }];
    expect(modelStatus(rows, { deprecation: undefined }, "2026-10-20")).toBe(
      "active",
    );
    expect(modelStatus(rows, { deprecation: "2026-06-01" }, "2026-10-20")).toBe(
      "deprecated",
    );
  });

  test("retired models get a banner, and overrides.json can correct the data", () => {
    const old: CostMap = {
      "old-model-1": chat("openai", 1, 2, { deprecation_date: "2026-01-01" }),
    };
    const v = view(old, "old-model-1");
    expect(v.status).toBe("retired");
    expect(modelBody(v, pageCopy(v, "2026-10-20"), ctx)).toContain(
      "<strong>Retired.</strong>",
    );
    expect(
      view(old, "old-model-1", { status: { "old-model-1": "active" } }).status,
    ).toBe("active");
  });

  test("a retired model's page stays up and links its successor", () => {
    const old: CostMap = {
      "old-model-1": chat("openai", 1, 2, { deprecation_date: "2026-01-01" }),
    };
    const v = view(old, "old-model-1");
    const html = modelBody(v, pageCopy(v, "2026-10-20"), {
      ...ctx,
      successor: { name: "New Model 2", slug: "new-model-2" },
    });
    expect(html).toContain(
      'Its successor is <a href="/models/new-model-2">New Model 2</a>.',
    );
    expect(html).not.toContain("http-equiv");
  });

  test("a retired model's markdown copy says so and links its successor", () => {
    const old: CostMap = {
      "old-model-1": chat("openai", 1, 2, { deprecation_date: "2026-01-01" }),
    };
    const v = view(old, "old-model-1");
    const copy = pageCopy(v, "2026-10-20");
    expect(modelMarkdown(v, copy, "2026-10-20")).toContain(
      "- Status: retired.",
    );
    expect(
      modelMarkdown(v, copy, "2026-10-20", {
        name: "New Model 2",
        slug: "new-model-2",
      }),
    ).toContain(
      "Its successor is New Model 2: https://models.litellm.ai/models/new-model-2",
    );
    const live = view({ "new-model-2": chat("openai", 1, 2) }, "new-model-2");
    expect(
      modelMarkdown(live, pageCopy(live, "2026-10-20"), "2026-10-20"),
    ).not.toContain("retired");
  });
});

describe("cookbook", () => {
  const sitemap = `<urlset><url><loc>https://docs.litellm.ai/docs/tutorials/</loc></url><url><loc>https://docs.litellm.ai/docs/tutorials/claude_code_gateway</loc></url><url><loc>https://docs.litellm.ai/docs/tutorials/claude_mcp</loc></url><url><loc>https://docs.litellm.ai/docs/proxy/configs</loc></url></urlset>`;
  const pages: Record<string, string> = {
    "https://docs.litellm.ai/docs/tutorials/claude_code_gateway.md": `---\ntitle: "Claude Code SSO"\nlast_updated: "2026-10-19"\nsummary: "Set up Claude Code with SSO."\n---\n# Claude Code SSO`,
    "https://docs.litellm.ai/docs/tutorials/claude_mcp.md": `---\ntitle: "Use Claude Code with MCPs"\nlast_updated: "2026-09-01"\n---\n`,
  };
  const fetchText = async (url: string) => {
    if (url === DOCS_SITEMAP_URL) return sitemap;
    if (pages[url]) return pages[url];
    throw new Error(`404 ${url}`);
  };

  test("lists every docs tutorial without the tutorials index page or its deploy-time date", async () => {
    expect(tutorialUrls(sitemap)).toEqual([
      "https://docs.litellm.ai/docs/tutorials/claude_code_gateway",
      "https://docs.litellm.ai/docs/tutorials/claude_mcp",
    ]);
    const list = await loadCookbook(fetchText, null);
    expect(list!.map((g) => [g.title, g.date])).toEqual([
      ["Claude Code SSO", undefined],
      ["Use Claude Code with MCPs", undefined],
    ]);
  });

  test("the docs copy of a guide wins over the old index entry, which keeps its date and tags", async () => {
    const index = [
      {
        title: "Claude Code with MCPs (old)",
        url: "https://docs.litellm.ai/docs/tutorials/claude_mcp/",
        date: "2026-01-15",
        tags: ["MCP"],
      },
      {
        title: "Only in the index",
        url: "https://example.com/guide",
        date: "2026-01-10",
      },
    ];
    const list = await loadCookbook(fetchText, index);
    expect(list).toHaveLength(3);
    expect(list!.find((g) => g.url!.includes("claude_mcp"))).toMatchObject({
      title: "Use Claude Code with MCPs",
      date: "2026-01-15",
      tags: ["MCP"],
    });
  });

  test("frontmatter reads quoted values", () => {
    expect(
      frontmatter(`---\ntitle: "A \\"quoted\\" title"\nsummary: plain\n---`),
    ).toEqual({ title: 'A "quoted" title', summary: "plain" });
  });
});

describe("calculator", () => {
  test("an introductory price is labelled with its end date", () => {
    const m = (slug: string, intro?: string) => ({
      slug,
      name: slug.toUpperCase(),
      input: 1,
      output: 2,
      providers: 1,
      ...(intro ? { intro } : {}),
    });
    const models = [m("intro-model", "December 31, 2026"), m("plain-model")];
    const html = calculatorBody(models, "intro-model", models, "2026-10-20");
    expect(html).toContain(
      ">INTRO-MODEL (introductory price until December 31, 2026)</option>",
    );
    expect(html).toContain(
      '<span class="note">introductory price until December 31, 2026</span>',
    );
    expect(html).toContain(">PLAIN-MODEL</option>");
  });
});

describe("model page calculator", () => {
  const costMap: CostMap = {
    "claude-sonnet-4-5": chat("anthropic", 3, 15, {
      deprecation_date: "2026-11-30",
    }),
    "claude-sonnet-3-7": chat("anthropic", 3, 15, {
      deprecation_date: "2026-02-19",
    }),
  };

  test("links /calculator for a model still sold, not for a retired one", () => {
    const sold = view(costMap, "claude-sonnet-4-5");
    expect(sold.status).toBe("deprecated");
    expect(calcSection(sold)).toContain(
      'href="/calculator?model=claude-sonnet-4-5"',
    );
    const retired = view(costMap, "claude-sonnet-3-7");
    expect(retired.status).toBe("retired");
    expect(calcSection(retired)).not.toContain("/calculator");
  });

  test("shows the Compare button on every model the comparison tool lists", () => {
    const tool = toolData(
      [view(costMap, "claude-sonnet-4-5"), view(costMap, "claude-sonnet-3-7")],
      () => null,
      new Set(),
    );
    for (const key of ["claude-sonnet-4-5", "claude-sonnet-3-7"]) {
      const v = view(costMap, key);
      const html = modelBody(v, pageCopy(v, "2026-10-20"), ctx);
      expect(html.includes(`href="/compare/custom?models=${v.slug}"`)).toBe(
        v.slug in tool.models,
      );
    }
    expect(Object.keys(tool.models)).toEqual(["claude-sonnet-4-5"]);
  });

  test("links /calculator only for models the calculator lists", () => {
    const inputOnly = view(
      { "together_ai/acme/acme-classify": chat("together_ai", 1, 0) },
      "acme-classify",
    );
    expect(calcSection(inputOnly)).toContain("cost calculator");
    expect(calcSection(inputOnly)).not.toContain("/calculator");
    expect(
      modelMarkdown(inputOnly, pageCopy(inputOnly, "2026-10-20"), "2026-10-20"),
    ).not.toContain("/calculator");
  });
});

describe("build-time fetch", () => {
  const responder = (replies: (number | Error)[]) => {
    const calls: string[] = [];
    const fetchFn = (async (url: string) => {
      calls.push(url);
      const reply = replies[calls.length - 1];
      if (reply instanceof Error) throw reply;
      return new Response(reply === 200 ? "ok" : "", { status: reply });
    }) as typeof fetch;
    return { calls, fetchFn };
  };
  const sleep = async () => {};

  test("retries a network error, a timeout, a 429 or a 5xx, then returns the body", async () => {
    const { calls, fetchFn } = responder([
      new TypeError("fetch failed"),
      503,
      200,
    ]);
    expect(
      await fetchWithRetry("https://example.com/a", { fetchFn, sleep }),
    ).toBe("ok");
    expect(calls).toHaveLength(3);
    const throttled = responder([429, 200]);
    expect(
      await fetchWithRetry("https://example.com/a", {
        fetchFn: throttled.fetchFn,
        sleep,
      }),
    ).toBe("ok");
  });

  test("gives up after the last attempt, and at once on a 404", async () => {
    const down = responder([500, 502, 503, 200]);
    await expect(
      fetchWithRetry("https://example.com/a", { fetchFn: down.fetchFn, sleep }),
    ).rejects.toThrow("https://example.com/a responded 503");
    expect(down.calls).toHaveLength(3);
    const missing = responder([404, 200]);
    await expect(
      fetchWithRetry("https://example.com/a", {
        fetchFn: missing.fetchFn,
        sleep,
      }),
    ).rejects.toThrow("responded 404");
    expect(missing.calls).toHaveLength(1);
  });

  test("binary downloads retry the same way", async () => {
    const { calls, fetchFn } = responder([503, 200]);
    const bytes = await fetchBytes("https://example.com/a.zip", {
      fetchFn,
      sleep,
    });
    expect(new TextDecoder().decode(bytes)).toBe("ok");
    expect(calls).toHaveLength(2);
  });
});
