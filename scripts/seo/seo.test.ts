import { describe, expect, test } from "vitest";
import { pageCopy } from "./copy";
import { article, tokensShort, usd, usdShort } from "./format";
import { assignSlugs, catalogSlugs, groupCostMap, normalizeKey, providerNamespaces, type CostMap } from "./group";
import { jsonLdScript, modelGraph } from "./jsonld";
import { loadPreviousManifest } from "./manifest";
import { modelMarkdown } from "./markdown";
import { buildModelView, cleanName } from "./model-view";
import { isLabProvider } from "./providers";

const chat = (provider: string, input: number, output: number, extra: Record<string, unknown> = {}) => ({
  litellm_provider: provider,
  mode: "chat",
  input_cost_per_token: input / 1e6,
  output_cost_per_token: output / 1e6,
  max_input_tokens: 1_000_000,
  max_output_tokens: 128_000,
  ...extra,
});

const COST_MAP: CostMap = {
  sample_spec: { litellm_provider: "x", mode: "chat" },
  "claude-opus-5-5": chat("anthropic", 4, 20, { cache_read_input_token_cost: 2e-7, cache_creation_input_token_cost: 5e-6, supports_vision: true }),
  "anthropic.claude-opus-5-5": chat("bedrock_converse", 4, 20),
  "us.anthropic.claude-opus-5-5": chat("bedrock_converse", 4.4, 22),
  "bedrock/us-gov-west-1/anthropic.claude-opus-5-5": chat("bedrock", 4.8, 24),
  "vertex_ai/claude-opus-5-5@default": chat("vertex_ai-anthropic_models", 4, 20),
  "perplexity/anthropic/claude-opus-5-5": chat("perplexity", 4, 20),
  "databricks/databricks-claude-opus-5-5": chat("databricks", 4.00001, 20),
  "openrouter/anthropic/claude-opus-5-5": chat("openrouter", 400, 2000),
  "gpt-4o": chat("openai", 2.5, 10),
  "gpt-4o-2024-05-13": chat("openai", 5, 15),
  "azure/eu/gpt-4o-2024-08-06": chat("azure", 2.75, 11),
  "gemini/gemini-nano-banana-2.1": {
    litellm_provider: "gemini",
    mode: "image_generation",
    output_cost_per_image: 0.0336,
    input_cost_per_token: 1.5e-6,
    max_input_tokens: 131072,
  },
  "vertex_ai/gemini-nano-banana-2.1": { litellm_provider: "vertex_ai-language-models", mode: "image_generation", output_cost_per_image: 0.0336 },
  "openrouter/google/gemini-nano-banana-2.1": { litellm_provider: "openrouter", mode: "chat", input_cost_per_token: 1.5e-6, output_cost_per_token: 7.5e-6 },
  "fireworks-ai-up-to-4b": { litellm_provider: "fireworks_ai", mode: "chat" },
  "perplexity/search": { litellm_provider: "perplexity", mode: "search" },
};

const views = () => {
  const groups = groupCostMap(COST_MAP);
  const slugs = assignSlugs(groups);
  return new Map(groups.map((g) => [g.pageKey, buildModelView(g, slugs.get(g.pageKey)!, {}, {}, "2026-09-22")]));
};

describe("model modalities", () => {
  const view = (extra: Record<string, unknown>) => {
    const [group] = groupCostMap({
      "audio-model": chat("openai", 1, 2, extra),
    });
    return buildModelView(group, "audio-model", {}, {}, "2026-10-24");
  };

  test("should preserve positive modality capabilities when a row has no modality arrays", () => {
    const model = view({
      supports_audio_input: true,
      supports_audio_output: true,
      supports_vision: true,
      supports_pdf_input: true,
      supports_video_input: false,
    });
    expect(model.inputModalities).toEqual(["text", "image", "pdf", "audio"]);
    expect(model.outputModalities).toEqual(["text", "audio"]);
  });

  test("should include the chat mode's text input and output without inventing additional capabilities", () => {
    const model = view({});
    expect(model.inputModalities).toEqual(["text"]);
    expect(model.outputModalities).toEqual(["text"]);
  });

  test("should leave unknown modalities unknown for a mode without an established text contract", () => {
    const model = view({ mode: "future_mode" });
    expect(model.inputModalities).toEqual([]);
    expect(model.outputModalities).toEqual([]);
  });

  test("should prefer explicit modality arrays over capability fallbacks", () => {
    const model = view({
      supported_modalities: ["text", "audio"],
      supported_output_modalities: ["text"],
      supports_vision: true,
      supports_audio_output: true,
    });
    expect(model.inputModalities).toEqual(["text", "audio"]);
    expect(model.outputModalities).toEqual(["text"]);
  });
});

describe("grouping", () => {
  test("puts every provider key for one model on one page", () => {
    const groups = groupCostMap(COST_MAP);
    const byPage = Object.fromEntries(groups.map((g) => [g.pageKey, g.members.map((m) => m.key)]));
    expect(byPage["claude-opus-5-5"]).toHaveLength(8);
    expect(byPage["gemini-nano-banana-2-1"]).toHaveLength(3);
    expect(byPage["gpt-4o"]).toEqual(["azure/eu/gpt-4o-2024-08-06", "gpt-4o", "gpt-4o-2024-05-13"]);
  });

  test("skips spec rows, size buckets and tools", () => {
    const keys = groupCostMap(COST_MAP).flatMap((g) => g.members.map((m) => m.key));
    expect(keys).not.toContain("sample_spec");
    expect(keys).not.toContain("fireworks-ai-up-to-4b");
    expect(keys).not.toContain("perplexity/search");
  });

  test("reads regions and inference profiles as qualifiers", () => {
    const providers = providerNamespaces(COST_MAP);
    expect(normalizeKey("us.anthropic.claude-opus-5-5", "bedrock_converse", providers).flags.geoProfile).toBe("us");
    expect(normalizeKey("bedrock/us-gov-west-1/anthropic.claude-opus-5-5", "bedrock", providers).flags.region).toBe("us-gov-west-1");
    expect(normalizeKey("azure/eu/gpt-4o-2024-08-06", "azure", providers).flags).toMatchObject({ region: "eu", snapshot: "2024-08-06" });
  });

  test("applies overrides", () => {
    const groups = groupCostMap(COST_MAP, { mergePages: { "gpt-4o": "claude-opus-5-5" }, excludePages: ["gemini-nano-banana-2-1"] });
    expect(groups.map((g) => g.pageKey)).toEqual(["claude-opus-5-5"]);
  });
});

describe("slugs", () => {
  test("use the lab's spelling of the model id", () => {
    const slugs = assignSlugs(groupCostMap(COST_MAP));
    expect(slugs.get("gemini-nano-banana-2-1")).toBe("gemini-nano-banana-2.1");
    expect(slugs.get("claude-opus-5-5")).toBe("claude-opus-5-5");
  });

  test("never change once published", () => {
    const slugs = assignSlugs(groupCostMap(COST_MAP), {}, { "gpt-4o": "gpt-4o-legacy" });
    expect(slugs.get("gpt-4o")).toBe("gpt-4o-legacy");
  });

  test("link every catalog key to its page, a bare Vertex key shadowed by its twin included", () => {
    const image = { litellm_provider: "vertex_ai-language-models", mode: "image_generation", output_cost_per_image: 0.0336 };
    const groups = groupCostMap({ "gemini-nano-banana-2.1": image, "vertex_ai/gemini-nano-banana-2.1": image });
    expect(catalogSlugs(groups, assignSlugs(groups))).toEqual({
      "gemini-nano-banana-2.1": "gemini-nano-banana-2.1",
      "vertex_ai/gemini-nano-banana-2.1": "gemini-nano-banana-2.1",
    });
  });
});

describe("formatting", () => {
  test("usd keeps two decimals and strips float noise", () => {
    expect(usd(4e-6 * 1e6)).toBe("$4.00");
    expect(usd(4.00001)).toBe("$4.00");
    expect(usd(0.0336)).toBe("$0.0336");
    expect(usd(0.000125)).toBe("$0.000125");
    expect(usd(1500)).toBe("$1,500.00");
    expect(usd(0)).toBe("$0");
    expect(usdShort(20)).toBe("$20");
    expect(usdShort(2.5)).toBe("$2.50");
  });

  test("tokensShort matches how context windows are quoted", () => {
    expect(tokensShort(128_000)).toBe("128K");
    expect(tokensShort(131_072)).toBe("128K");
    expect(tokensShort(200_000)).toBe("200K");
    expect(tokensShort(1_048_576)).toBe("1M");
  });

  test("article follows pronunciation", () => {
    expect(article("8,191")).toBe("an");
    expect(article("128,000")).toBe("a");
    expect(article("1,000,000")).toBe("a");
  });

  test("cleanName tidies names built from ids", () => {
    expect(cleanName("DeepSeek v4 Pro")).toBe("DeepSeek V4 Pro");
    expect(cleanName("Command A 03 2025")).toBe("Command A");
    expect(cleanName("Claude Opus 5.5 (US)")).toBe("Claude Opus 5.5");
  });
});

describe("model view", () => {
  test("quotes the lab's own price and flags outliers", () => {
    const v = views().get("claude-opus-5-5")!;
    expect(v.headline?.key).toBe("claude-opus-5-5");
    expect(v.headlineBasis).toBe("first_party");
    expect(v.rows.find((r) => r.provider === "openrouter")?.outlier).toBe(true);
    // The range covers every row the table shows (the $4.80 GovCloud row too); only the 100x outlier is out.
    expect(v.range).toMatchObject({ min: 4, max: 4.8 });
  });

  test("only the model's own lab counts as first-party", () => {
    expect(isLabProvider("perplexity", "Anthropic")).toBe(false);
    expect(isLabProvider("perplexity", "Perplexity")).toBe(true);
    const v = views().get("claude-opus-5-5")!;
    expect(v.rows.find((r) => r.provider === "perplexity")?.firstParty).toBe(false);
  });

  test("prefers the undated alias over snapshots", () => {
    expect(views().get("gpt-4o")!.headline?.key).toBe("gpt-4o");
  });

  test("lists a bare Vertex key and its vertex_ai/ twin once", () => {
    const image = { litellm_provider: "vertex_ai-language-models", mode: "image_generation", output_cost_per_image: 0.0336 };
    const [group] = groupCostMap({ "gemini-nano-banana-2.1": image, "vertex_ai/gemini-nano-banana-2.1": image });
    expect(group.members).toHaveLength(2);
    const names = buildModelView(group, "gemini-nano-banana-2.1", {}, {}, null).rows.map((r) => r.modelString);
    expect(names).toEqual(["vertex_ai/gemini-nano-banana-2.1"]);
  });
});

describe("previous manifest", () => {
  const MANIFEST = { version: 1, buildDate: "2026-10-01", costMapHash: "abc", models: {} };
  const answer = (res: Response | Error) => (async () => {
    if (res instanceof Error) throw res;
    return res;
  }) as unknown as typeof fetch;
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  const URL = "https://models.litellm.ai/models/manifest.json";

  test("returns the live manifest", async () => {
    expect(await loadPreviousManifest(URL, answer(json(MANIFEST)))).toEqual(MANIFEST);
  });

  test("treats a missing manifest or the old app shell as a first deploy", async () => {
    expect(await loadPreviousManifest(URL, answer(new Response("not found", { status: 404 })))).toBeNull();
    const shell = new Response("<!doctype html><div id=app></div>", { headers: { "content-type": "text/html" } });
    expect(await loadPreviousManifest(URL, answer(shell))).toBeNull();
    expect(await loadPreviousManifest("none", answer(new Error("never fetched")))).toBeNull();
  });

  test("fails the build instead of dropping history when the live site errors", async () => {
    await expect(loadPreviousManifest(URL, answer(new Response("down", { status: 503 })))).rejects.toThrow("503");
    await expect(loadPreviousManifest(URL, answer(new TypeError("fetch failed")))).rejects.toThrow("fetch failed");
    const truncated = new Response('{"version":1,"models":{', { headers: { "content-type": "application/json" } });
    await expect(loadPreviousManifest(URL, answer(truncated))).rejects.toThrow();
  });
});

describe("copy", () => {
  test("titles carry the price and month; descriptions fit in 160 characters", () => {
    for (const v of views().values()) {
      const c = pageCopy(v, "2026-10-06");
      expect(c.title).toContain("(Oct 2026)");
      expect(c.description.length).toBeLessThanOrEqual(160);
      expect(c.description).not.toContain("…");
      expect(c.answer.startsWith("As of October 6, 2026,")).toBe(true);
    }
    const opus = pageCopy(views().get("claude-opus-5-5")!, "2026-10-06");
    expect(opus.title).toBe("Claude Opus 5.5 API Pricing (Oct 2026): $4/$20 per 1M Tokens | LiteLLM");
    expect(opus.faq[0].a).toContain("$4.00 per 1M input tokens and $20.00 per 1M output tokens on Anthropic");
    const nano = pageCopy(views().get("gemini-nano-banana-2-1")!, "2026-10-06");
    expect(nano.title).toContain("$0.0336 per Image");
  });

  test("prices that print the same are not quoted as a range", () => {
    const groups = groupCostMap({
      "claude-opus-5": chat("anthropic", 5, 25),
      "databricks/databricks-claude-opus-5": chat("databricks", 5.00001, 25),
    });
    const view = buildModelView(groups[0], "claude-opus-5", {}, {}, null);
    expect(view.range).toBeDefined();
    expect(pageCopy(view, "2026-10-06").answer).not.toContain("ranges from");
  });

  test("a free cache write is quoted, not dropped", () => {
    const groups = groupCostMap({
      "deepseek/deepseek-chat": chat("deepseek", 0.28, 0.42, { cache_read_input_token_cost: 2.8e-8, cache_creation_input_token_cost: 0 }),
    });
    const copy = pageCopy(buildModelView(groups[0], "deepseek-chat", {}, {}, null), "2026-10-06");
    expect(copy.answer).toContain("cache reads at $0.028 and cache writes at $0 per 1M tokens");
  });

  test("FAQ dates come from LiteLLM's own history", () => {
    const c = pageCopy(views().get("claude-opus-5-5")!, "2026-10-06");
    expect(c.faq.find((f) => f.q.startsWith("When did LiteLLM add"))?.a).toContain("on September 22, 2026");
  });
});

describe("structured data and markdown", () => {
  test("JSON-LD lists one offer per price and can't break out of its script tag", () => {
    const v = views().get("claude-opus-5-5")!;
    const graph = modelGraph(v, pageCopy(v, "2026-10-06"), "2026-10-06") as { "@graph": Record<string, unknown>[] };
    const app = graph["@graph"].find((n) => n["@type"] === "SoftwareApplication") as { offers: { name: string; price: number }[] };
    expect(app.offers.map((o) => [o.name, o.price])).toEqual([
      ["Input price", 4],
      ["Output price", 20],
      ["Cache read price", 0.2],
      ["Cache write price", 5],
    ]);
    expect(jsonLdScript({ name: "</script><script>alert(1)</script>" })).not.toContain("</script><script>");
  });

  test("markdown copy includes prices and the FAQ", () => {
    const v = views().get("claude-opus-5-5")!;
    const md = modelMarkdown(v, pageCopy(v, "2026-10-06"), "2026-10-06");
    expect(md).toContain("| Anthropic | `claude-opus-5-5` | $4.00 | $20.00 |");
    expect(md).toContain("### How much does Claude Opus 5.5 cost?");
  });
});

describe("introductory prices", () => {
  const argon = (today: string) => {
    const costMap: CostMap = { "gemini/gemini-4-argon": chat("gemini", 2, 10, { cache_read_input_token_cost: 1e-7 }) };
    const overrides = { introPricing: { "gemini-4-argon": { until: "2026-11-30", source: "https://ai.google.dev/gemini-api/docs/pricing" } } };
    const groups = groupCostMap(costMap, overrides);
    const slugs = assignSlugs(groups, overrides);
    return buildModelView(groups[0], slugs.get(groups[0].pageKey)!, overrides, {}, "2026-10-13", today);
  };

  test("are named in the answer, description, FAQ, markdown and offers until they end", () => {
    const v = argon("2026-10-13");
    const copy = pageCopy(v, "2026-10-13");
    expect(copy.answer).toContain("Google lists these as introductory prices through November 30, 2026.");
    expect(copy.description).toContain("Introductory price through November 30, 2026.");
    expect(copy.description.length).toBeLessThanOrEqual(160);
    expect(copy.faq[0].a).toContain("introductory prices through November 30, 2026");
    expect(modelMarkdown(v, copy, "2026-10-13")).toContain("- Introductory price until: November 30, 2026");
    const graph = JSON.stringify(modelGraph(v, copy, "2026-10-13"));
    expect(graph).toContain('"priceValidUntil":"2026-11-30"');
  });

  test("drop off once the end date has passed", () => {
    expect(argon("2026-11-30").intro).toBeDefined();
    const v = argon("2026-12-01");
    expect(v.intro).toBeUndefined();
    expect(pageCopy(v, "2026-12-01").answer).not.toContain("introductory");
  });
});
