import { TOOL_JS, toolData } from "./compare-tool";
import { strToU8, zipSync } from "fflate";
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";
import middleware from "../../middleware";
import {
  benchmarksFor,
  parseBenchmarkZip,
  parseCsv,
  splitVersion,
} from "./benchmarks";
import {
  WEEKLY_CAP,
  answerLine,
  benchRows,
  compareCopy,
  compareSlug,
  contextPair,
  indexable,
  reasonsToPick,
  selectPairs,
  successorOf,
  type Pair,
} from "./compare";
import {
  assignSlugs,
  groupCostMap,
  type CostMap,
  type Overrides,
} from "./group";
import { compareBody, type CompareView } from "./html";
import { compareMarkdown } from "./markdown";
import { buildModelView, type ModelView } from "./model-view";

const chat = (
  provider: string,
  input: number,
  output: number,
  context: number,
  extra: Record<string, unknown> = {},
) => ({
  litellm_provider: provider,
  mode: "chat",
  input_cost_per_token: input / 1e6,
  output_cost_per_token: output / 1e6,
  max_input_tokens: context,
  ...extra,
});

const COST_MAP: CostMap = {
  "claude-opus-5-5": chat("anthropic", 4, 20, 1_000_000, {
    supports_function_calling: true,
  }),
  "anthropic.claude-opus-5-5": chat("bedrock_converse", 4, 20, 1_000_000),
  "claude-opus-5": chat("anthropic", 5, 25, 1_000_000),
  "gpt-6-astra": chat("openai", 10, 50, 922_000, {
    supports_function_calling: false,
  }),
  "azure/gpt-6-astra": chat("azure", 10, 50, 922_000),
  "gemini/gemini-2.0-flash": chat("gemini", 0.1, 0.4, 1_000_000, {
    deprecation_date: "2026-06-01",
  }),
  "gemini/gemini-3.8-flash": chat("gemini", 0.75, 3.75, 1_048_576),
};

const ADDED: Record<string, string> = {
  "claude-opus-5-5": "2026-09-22",
  "claude-opus-5": "2026-07-24",
  "gpt-6-astra": "2026-09-03",
  "gemini-2-0-flash": "2025-02-01",
  "gemini-3-8-flash": "2026-09-02",
};

function views(costMap = COST_MAP, overrides: Overrides = {}): ModelView[] {
  const groups = groupCostMap(costMap, overrides);
  const slugs = assignSlugs(groups, overrides);
  return groups.map((g) =>
    buildModelView(
      g,
      slugs.get(g.pageKey)!,
      overrides,
      {},
      ADDED[g.pageKey] ?? null,
      "2026-10-20",
    ),
  );
}

const bySlug = (vs: ModelView[], slug: string) =>
  vs.find((v) => v.slug === slug)!;
const pair = (
  vs: ModelView[],
  x: string,
  y: string,
  kind: Pair["kind"] = "flagship",
  reviewed = true,
): Pair => {
  const [a, b] = [bySlug(vs, x), bySlug(vs, y)].sort((p, q) =>
    p.slug.localeCompare(q.slug),
  );
  return { slug: compareSlug(x, y), a, b, kind, reviewed };
};

describe("pair selection", () => {
  const families = {
    "claude-opus": "^claude-opus-\\d+(-\\d+)?$",
    "gemini-flash": "^gemini-\\d+(\\.\\d+)?-flash$",
  };

  test("one URL per pair, alphabetical, whichever order the pair is listed in", () => {
    expect(compareSlug("gpt-6-astra", "claude-opus-5-5")).toBe(
      "claude-opus-5-5-vs-gpt-6-astra",
    );
    const vs = views();
    const { pairs } = selectPairs(
      vs,
      { compare: { pairs: [["gpt-6-astra", "claude-opus-5-5", "flagship"]] } },
      {},
      "2026-10-20",
    );
    const reviewed = pairs.find((p) => p.reviewed)!;
    expect([reviewed.slug, reviewed.a.slug, reviewed.b.slug]).toEqual([
      "claude-opus-5-5-vs-gpt-6-astra",
      "claude-opus-5-5",
      "gpt-6-astra",
    ]);
  });

  test("the reverse order redirects to that URL, markdown copies included", () => {
    const res = middleware(
      new Request(
        "https://models.litellm.ai/compare/gpt-6-astra-vs-claude-opus-5-5",
      ),
    )!;
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(
      "https://models.litellm.ai/compare/claude-opus-5-5-vs-gpt-6-astra",
    );
    const md = middleware(
      new Request(
        "https://models.litellm.ai/compare/gpt-6-astra-vs-claude-opus-5-5.md",
      ),
    )!;
    expect(md.headers.get("location")).toBe(
      "https://models.litellm.ai/compare/claude-opus-5-5-vs-gpt-6-astra.md",
    );
    expect(
      middleware(
        new Request(
          "https://models.litellm.ai/compare/claude-opus-5-5-vs-gpt-6-astra",
        ),
      ),
    ).toBeUndefined();
  });

  test("adds each model's family predecessor, and leaves retired models out", () => {
    const vs = views();
    const { pairs } = selectPairs(vs, { families }, {}, "2026-10-20");
    const slugs = pairs.map((p) => p.slug);
    expect(slugs).toContain("claude-opus-5-vs-claude-opus-5-5");
    expect(slugs.some((s) => s.includes("gemini-2.0-flash"))).toBe(false);
  });

  test("releases at most WEEKLY_CAP new automatic pairs a week, counting reviewed ones", () => {
    const vs = views();
    const recent = Object.fromEntries(
      Array.from({ length: WEEKLY_CAP }, (_, i) => [
        `x-${i}-vs-y`,
        { firstSeen: "2026-10-18", kind: "new" as const },
      ]),
    );
    expect(
      selectPairs(vs, { families }, recent, "2026-10-20").pairs,
    ).toHaveLength(0);
    expect(
      selectPairs(vs, { families }, {}, "2026-10-20").pairs.length,
    ).toBeGreaterThan(0);
  });

  test("a published automatic pair stays, with its first-published date", () => {
    const vs = views();
    const prev = {
      "claude-opus-5-vs-claude-opus-5-5": {
        firstSeen: "2026-09-25",
        kind: "successor" as const,
      },
    };
    const { published } = selectPairs(vs, { families }, prev, "2026-10-20");
    expect(published["claude-opus-5-vs-claude-opus-5-5"]).toEqual({
      firstSeen: "2026-09-25",
      kind: "successor",
    });
  });

  test("a published automatic pair stays after the build stops proposing it", () => {
    const vs = views();
    const prev = {
      "claude-opus-5-5-vs-gpt-6-astra": {
        firstSeen: "2026-09-25",
        kind: "new" as const,
      },
    };
    const { pairs, published } = selectPairs(
      vs,
      { families },
      prev,
      "2027-03-01",
    );
    expect(pairs.map((p) => p.slug)).toContain(
      "claude-opus-5-5-vs-gpt-6-astra",
    );
    expect(published["claude-opus-5-5-vs-gpt-6-astra"]).toEqual({
      firstSeen: "2026-09-25",
      kind: "new",
    });
  });

  test("a published pair keeps its page once a model in it is deprecated, but no new pair starts with it", () => {
    const vs = views({
      ...COST_MAP,
      "claude-opus-5": chat("anthropic", 5, 25, 1_000_000, {
        deprecation_date: "2027-01-01",
      }),
    });
    expect(bySlug(vs, "claude-opus-5").status).toBe("deprecated");
    const slug = "claude-opus-5-vs-claude-opus-5-5";
    const prev = {
      [slug]: { firstSeen: "2026-09-25", kind: "successor" as const },
    };
    const kept = selectPairs(vs, { families }, prev, "2026-10-20");
    expect(kept.pairs.map((p) => p.slug)).toContain(slug);
    expect(kept.published[slug]).toEqual(prev[slug]);
    expect(
      selectPairs(vs, { families }, {}, "2026-10-20").pairs.map((p) => p.slug),
    ).not.toContain(slug);
  });

  test("a published pair with a retired model stays up but is not indexed", () => {
    const slug = "gemini-2.0-flash-vs-gemini-3.8-flash";
    const prev = {
      [slug]: { firstSeen: "2026-03-01", kind: "successor" as const },
    };
    const kept = selectPairs(
      views(),
      { families },
      prev,
      "2026-10-20",
    ).pairs.find((p) => p.slug === slug);
    expect(kept?.a.status).toBe("retired");
    expect(indexable(kept!)).toBe(false);
  });

  test("a retired model points at its family's newest active model", () => {
    const vs = views();
    expect(
      successorOf(bySlug(vs, "gemini-2.0-flash"), vs, families)?.slug,
    ).toBe("gemini-3.8-flash");
    expect(successorOf(bySlug(vs, "gpt-6-astra"), vs, families)).toBeNull();
  });
});

describe("comparison copy", () => {
  test("answer line: the pricier model, its premium, and both context windows", () => {
    const vs = views();
    expect(answerLine(pair(vs, "claude-opus-5-5", "gpt-6-astra"))).toBe(
      "GPT-6 Astra costs 150% more per input token than Claude Opus 5.5 ($10.00 vs $4.00 per 1M) and has a 922K-token context window versus 1M.",
    );
  });

  test("the answer says when a model's price is introductory, and until when", () => {
    const vs = views(COST_MAP, {
      introPricing: {
        "gpt-6-astra": {
          until: "2026-12-31",
          source: "https://example.com/pricing",
        },
      },
    });
    expect(
      compareCopy(pair(vs, "claude-opus-5-5", "gpt-6-astra"), "2026-10-20")
        .answer,
    ).toContain(
      "GPT-6 Astra's price is introductory through December 31, 2026.",
    );
    expect(
      compareCopy(pair(views(), "claude-opus-5-5", "gpt-6-astra"), "2026-10-20")
        .answer,
    ).not.toContain("introductory");
  });

  test("context windows that round to the same short form are written out", () => {
    expect(contextPair(1_000_000, 1_048_576)).toEqual([
      "1,000,000",
      "1,048,576",
    ]);
    expect(contextPair(1_000_000, 922_000)).toEqual(["1M", "922K"]);
  });

  test("'when to pick' bullets come only from real differences, with the right percentage", () => {
    const vs = views();
    const opus = bySlug(vs, "claude-opus-5-5");
    const astra = bySlug(vs, "gpt-6-astra");
    const forOpus = reasonsToPick(opus, astra);
    expect(forOpus[0]).toBe(
      "Costs 60% less per input token: $4.00 vs $10.00 per 1M.",
    );
    expect(forOpus).toContain(
      "Supports function calling, which GPT-6 Astra doesn't list.",
    );
    expect(reasonsToPick(astra, opus)).toEqual([]);
    const same = views({
      "a-model-1": chat("openai", 2, 10, 200_000),
      "b-model-1": chat("anthropic", 2, 10, 200_000),
    });
    expect(reasonsToPick(same[0], same[1])).toEqual([]);
  });

  test("automatic pairs that say nothing new aren't indexed; reviewed and successor pairs are", () => {
    const same = views({
      "a-model-1": chat("openai", 2, 10, 200_000),
      "b-model-1": chat("anthropic", 2, 10, 200_000),
    });
    const p: Pair = {
      slug: "a-model-1-vs-b-model-1",
      a: same[0],
      b: same[1],
      kind: "new",
      reviewed: false,
    };
    expect(indexable(p)).toBe(false);
    expect(indexable({ ...p, reviewed: true })).toBe(true);
    expect(indexable({ ...p, kind: "successor" })).toBe(true);
  });
});

describe("Epoch AI benchmarks", () => {
  const csv = (rows: string[][]) =>
    rows
      .map((r) =>
        r
          .map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c))
          .join(","),
      )
      .join("\n");
  const zip = zipSync({
    "gpqa_diamond.csv": strToU8(
      csv([
        ["Model version", "Best score (across scorers)", "Started at"],
        ["gpt-6-astra_max", "0.958", "2026-09-10T00:00:00Z"],
        ["gpt-6-astra_low", "0.80", "2026-09-10T00:00:00Z"],
        ["claude-opus-5-5_max", "0.906", "2026-09-25T00:00:00Z"],
        ["claude-opus-5-5-preview_max", "0.99", "2026-09-25T00:00:00Z"],
      ]),
    ),
    "swe_bench_verified.csv": strToU8(
      csv([
        ["Model version", "Best score (across scorers)", "Started at"],
        ["gpt-6-astra_max", "0.7", "2026-09-10"],
      ]),
    ),
    "benchmark_metadata.csv": strToU8(
      csv([
        ["benchmark", "source_file", "score_column", "scale"],
        [
          "GPQA diamond",
          "gpqa_diamond.csv",
          "Best score (across scorers)",
          "1.0",
        ],
        [
          "SWE-Bench verified",
          "swe_bench_verified.csv",
          "Best score (across scorers)",
          "1.0",
        ],
        ["FrontierCode", "frontiercode_external.csv", "Main score", "1.0"],
      ]),
    ),
    "frontiercode_external.csv": strToU8(
      csv([
        ["Model version", "Main score", "Source"],
        [
          "claude-opus-5-5_medium",
          "0.546",
          "https://cognition.com/frontiercode",
        ],
        ["gpt-6-astra_max", "0.533", "https://cognition.com/frontiercode"],
      ]),
    ),
    "epoch_capabilities_index/eci_scores.csv": strToU8(
      csv([
        ["Model", "eci", "date"],
        ["GPT-6 Astra", "166.41", "2026-09-03"],
        ["Claude Opus 5.5", "166.82", "2026-09-22"],
      ]),
    ),
  });
  const data = parseBenchmarkZip(zip);

  test("matches model ids exactly, keeps each model's best setting, and ignores near-misses", () => {
    const opus = benchmarksFor(data, ["claude-opus-5-5"], ["Claude Opus 5.5"])!;
    expect(opus.eci).toEqual({ score: 166.82, date: "2026-09-22" });
    // Coding and agents first, then reasoning; external results are marked as such.
    expect(
      opus.scores.map((x) => [
        x.benchmark,
        x.category,
        x.epoch,
        x.score,
        x.setting,
      ]),
    ).toEqual([
      ["FrontierCode", "Coding and agents", false, 0.546, "medium"],
      ["GPQA Diamond", "Reasoning and knowledge", true, 0.906, "max"],
    ]);
    expect(
      benchmarksFor(data, ["gpt-6-astra"], ["GPT-6 Astra"])!.scores.find(
        (x) => x.benchmark === "GPQA Diamond",
      ),
    ).toMatchObject({ score: 0.958, setting: "max" });
    expect(
      benchmarksFor(data, ["claude-opus-5"], ["Claude Opus 5"]),
    ).toBeNull();
  });

  test("the page's own id wins over a higher-scoring snapshot listed on the same page", () => {
    const gpqa = (ids: string[]) =>
      benchmarksFor(data, ids, ["Claude Opus 5.5"])!.scores.find(
        (x) => x.benchmark === "GPQA Diamond",
      )!.score;
    expect(gpqa(["claude-opus-5-5", "claude-opus-5-5-preview"])).toBe(0.906);
    expect(gpqa(["claude-opus-5-5-preview", "claude-opus-5-5"])).toBe(0.99);
  });

  test("comparison rows only show benchmarks both models have", () => {
    const rows = benchRows(
      benchmarksFor(data, ["claude-opus-5-5"], ["Claude Opus 5.5"]),
      benchmarksFor(data, ["gpt-6-astra"], ["GPT-6 Astra"]),
    );
    expect(rows.map((r) => [r.name, r.category, r.a, r.b])).toEqual([
      ["Epoch Capabilities Index", "Overall", "166.8", "166.4"],
      ["FrontierCode", "Coding and agents", "54.6% (medium)", "53.3% (max)"],
      ["GPQA Diamond", "Reasoning and knowledge", "90.6% (max)", "95.8% (max)"],
    ]);
  });

  test("the page and its markdown copy both credit Epoch with the data date", () => {
    const vs = views();
    const p = pair(vs, "claude-opus-5-5", "gpt-6-astra");
    const view: CompareView = {
      slug: p.slug,
      a: p.a,
      b: p.b,
      copy: compareCopy(p, "2026-10-20"),
      rows: [],
      bench: benchRows(
        benchmarksFor(data, ["claude-opus-5-5"], ["Claude Opus 5.5"]),
        benchmarksFor(data, ["gpt-6-astra"], ["GPT-6 Astra"]),
      ),
      benchDate: "2026-09-25",
      cheapest: [],
      related: [],
      buildDate: "2026-10-20",
      hubs: new Set(),
    };
    expect(compareBody(view)).toContain("data as of September 25, 2026");
    expect(compareBody(view)).toContain(
      '<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>',
    );
    expect(compareMarkdown(view)).toContain(
      "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), data as of September 25, 2026",
    );
  });

  test("dated snapshots match their undated model; quoted CSV fields parse", () => {
    expect(splitVersion("gpt-5.4-2026-03-05_xhigh")).toEqual({
      id: "gpt-5-4",
      setting: "xhigh",
    });
    expect(splitVersion("glm-5.3_unknown")).toEqual({
      id: "glm-5-3",
      setting: null,
    });
    expect(parseCsv('a,b\n"x, ""y""",2\n')).toEqual([{ a: 'x, "y"', b: "2" }]);
  });
});

describe("comparison tool data", () => {
  test("lists every comparable model with its numbers, and only real pairs", () => {
    const vs = views();
    const { models, pairs } = toolData(
      vs,
      () => null,
      new Set(["claude-opus-5-5-vs-gpt-6-astra", "gone-model-vs-gpt-6-astra"]),
    );
    expect(models["claude-opus-5-5"]).toMatchObject({
      n: "Claude Opus 5.5",
      in: 4,
      out: 20,
      ctx: 1_000_000,
      p: 2,
      by: "Anthropic",
      f: { tools: 1 },
    });
    expect(models["gpt-6-astra"].f.tools).toBe(0);
    // Retired models can't be picked.
    expect(models["gemini-2.0-flash"]).toBeUndefined();
    expect(pairs).toEqual(["claude-opus-5-5-vs-gpt-6-astra"]);
  });
});

describe("comparison tool page", () => {
  const element = () => ({
    innerHTML: "",
    hidden: false,
    children: [],
    setAttribute() {},
    addEventListener() {},
    appendChild() {},
  });
  async function renderTool(data: unknown, picked: string[]): Promise<string> {
    const root = element();
    runInNewContext(TOOL_JS.replace(/^<script>|<\/script>$/g, ""), {
      document: {
        getElementById: (id: string) => (id === "ct" ? root : null),
        createElement: element,
        body: element(),
      },
      location: {
        search: `?models=${picked.join(",")}`,
        pathname: "/compare/custom",
      },
      history: { replaceState() {} },
      URLSearchParams,
      addEventListener() {},
      setTimeout,
      fetch: async () => ({ json: async () => data }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return root.innerHTML;
  }

  test("benchmark text is escaped and credited to Epoch AI under CC BY 4.0 with its date", async () => {
    const vs = views(COST_MAP, {
      introPricing: {
        "gpt-6-astra": {
          until: "2026-12-31",
          source: "https://example.com/pricing",
        },
      },
    });
    const benched = toolData(
      vs,
      (v) =>
        v.slug === "gpt-6-astra"
          ? {
              scores: [
                {
                  benchmark: "GPQA Diamond",
                  url: "https://epoch.ai/benchmarks",
                  category: "Reasoning and knowledge",
                  epoch: true,
                  score: 0.958,
                  setting: '<img src=x onerror="alert(1)">',
                  date: "2026-09-10",
                },
              ],
            }
          : null,
      new Set(),
    );
    expect(benched.asOf).toBe("September 10, 2026");
    expect(benched.models["gpt-6-astra"].iu).toBe("December 31, 2026");
    const html = await renderTool(benched, ["claude-opus-5-5", "gpt-6-astra"]);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("OpenAI, introductory until December 31, 2026");
    expect(html).toContain(
      'href="https://creativecommons.org/licenses/by/4.0/"',
    );
    expect(html).toContain("data as of September 10, 2026");

    const plain = await renderTool(
      toolData(vs, () => null, new Set()),
      ["claude-opus-5-5"],
    );
    expect(plain).toContain("Claude Opus 5.5");
    expect(plain).not.toContain("Epoch AI");
  });
});
