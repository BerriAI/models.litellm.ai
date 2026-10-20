import { describe, expect, test } from "vitest";
import middleware, { NOT_FOUND_PATH } from "../../middleware";
import { cookbookPage, guardrailsPage, providersPage } from "./app-pages";
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
import { modelBody } from "./html";
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

  test("cookbook and guardrails pages go noindex when their data can't load", () => {
    expect(cookbookPage(null).indexable).toBe(false);
    expect(guardrailsPage(null).indexable).toBe(false);
    const page = cookbookPage([
      {
        title: "Claude Code Quickstart",
        url: "https://docs.litellm.ai/x",
        date: "2026-01-15",
      },
    ]);
    expect(page.indexable).toBe(true);
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

  test("lists every docs tutorial, newest first, without the tutorials index page", async () => {
    expect(tutorialUrls(sitemap)).toEqual([
      "https://docs.litellm.ai/docs/tutorials/claude_code_gateway",
      "https://docs.litellm.ai/docs/tutorials/claude_mcp",
    ]);
    const list = await loadCookbook(fetchText, null);
    expect(list!.map((g) => [g.title, g.date])).toEqual([
      ["Claude Code SSO", "2026-10-19"],
      ["Use Claude Code with MCPs", "2026-09-01"],
    ]);
  });

  test("the docs copy of a guide wins over the old index entry, which keeps its tags", async () => {
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
      date: "2026-09-01",
      tags: ["MCP"],
    });
  });

  test("frontmatter reads quoted values", () => {
    expect(
      frontmatter(`---\ntitle: "A \\"quoted\\" title"\nsummary: plain\n---`),
    ).toEqual({ title: 'A "quoted" title', summary: "plain" });
  });
});
