/**
 * Benchmark scores from Epoch AI's Benchmarking Hub (https://epoch.ai/benchmarks), licensed CC BY 4.0 with
 * credit required. That covers Epoch's own evaluation runs, its Capabilities Index, and the external results it
 * collects (`*_external.csv`), which are credited to their original source as well; Epoch notes that a few
 * external datasets keep their own permissive license (Aider Polyglot: Apache 2.0).
 *
 * Matching is exact, never fuzzy: an Epoch model version (`gpt-6-astra_max`) is
 * our model id plus a reasoning setting, so the id before `_` must equal one of a
 * page's ids after normalizing dots to dashes. A wrong match would put a score on
 * the wrong model, so anything that doesn't match exactly is left out.
 */
import { unzipSync, strFromU8 } from "fflate";

export const EPOCH_DATA_URL = "https://epoch.ai/data/benchmark_data.zip";
export const EPOCH_HUB_URL = "https://epoch.ai/benchmarks";

export type BenchmarkCategory =
  | "Coding and agents"
  | "Reasoning and knowledge"
  | "Math";

/**
 * Benchmarks shown on comparison pages, grouped and in display order. `epoch` marks Epoch's own runs; the rest are
 * external results Epoch collects, linked to their source. The score column and scale come from Epoch's
 * benchmark_metadata.csv; every one here is on a 0 to 1 scale.
 */
export const BENCHMARKS: {
  file: string;
  name: string;
  category: BenchmarkCategory;
  url: string;
  epoch?: boolean;
}[] = [
  {
    file: "frontiercode_external.csv",
    name: "FrontierCode",
    category: "Coding and agents",
    url: "https://cognition.com/frontiercode",
  },
  {
    file: "frontierswe_external.csv",
    name: "FrontierSWE",
    category: "Coding and agents",
    url: "https://www.frontierswe.com/",
  },
  {
    file: "deepswe_external.csv",
    name: "DeepSWE",
    category: "Coding and agents",
    url: "https://deepswe.datacurve.ai/",
  },
  {
    file: "swe_bench_verified.csv",
    name: "SWE-bench Verified",
    category: "Coding and agents",
    url: "https://epoch.ai/benchmarks/swe-bench-verified",
    epoch: true,
  },
  {
    file: "terminalbench_external.csv",
    name: "Terminal-Bench",
    category: "Coding and agents",
    url: "https://www.tbench.ai/leaderboard",
  },
  {
    file: "apex_agents_external.csv",
    name: "APEX-Agents",
    category: "Coding and agents",
    url: "https://epoch.ai/benchmarks",
  },
  {
    file: "osworld_2_external.csv",
    name: "OSWorld 2.0",
    category: "Coding and agents",
    url: "https://osworld-v2.xlang.ai/",
  },
  {
    file: "gpqa_diamond.csv",
    name: "GPQA Diamond",
    category: "Reasoning and knowledge",
    url: "https://epoch.ai/benchmarks/gpqa-diamond",
    epoch: true,
  },
  {
    file: "hle_external.csv",
    name: "Humanity's Last Exam",
    category: "Reasoning and knowledge",
    url: "https://lastexam.ai/",
  },
  {
    file: "arc_agi_2_external.csv",
    name: "ARC-AGI-2",
    category: "Reasoning and knowledge",
    url: "https://arcprize.org/leaderboard",
  },
  {
    file: "simpleqa_verified.csv",
    name: "SimpleQA Verified",
    category: "Reasoning and knowledge",
    url: "https://epoch.ai/benchmarks/simple-qa-verified",
    epoch: true,
  },
  // Tiers 1-3 v2 supersedes the original FrontierMath run (benchmark_metadata.csv `superseded_by`).
  {
    file: "frontiermath_tiers_1_3_v2.csv",
    name: "FrontierMath (tiers 1-3)",
    category: "Math",
    url: "https://epoch.ai/benchmarks/frontiermath-tiers-1-3-v2",
    epoch: true,
  },
  {
    file: "frontiermath_tier_4_v2.csv",
    name: "FrontierMath (tier 4)",
    category: "Math",
    url: "https://epoch.ai/benchmarks/frontiermath-tier-4-v2",
    epoch: true,
  },
  {
    file: "otis_mock_aime_2024_2025.csv",
    name: "OTIS Mock AIME 2024-2025",
    category: "Math",
    url: "https://epoch.ai/benchmarks",
    epoch: true,
  },
];

export type Score = {
  benchmark: string;
  url: string;
  category: BenchmarkCategory;
  /** True for Epoch's own runs; false for external results Epoch collects. */
  epoch: boolean;
  /** 0 to 1. */
  score: number;
  /** Reasoning setting Epoch ran it at, e.g. "high"; null when Epoch doesn't say. */
  setting: string | null;
  /** When Epoch ran it (YYYY-MM-DD). */
  date: string | null;
};

export type ModelBenchmarks = {
  eci?: { score: number; date: string | null };
  scores: Score[];
};

export type BenchmarkData = {
  /** Normalized model id -> Epoch's best run per benchmark. */
  runs: Map<string, Map<string, Score>>;
  /** Lowercased display name -> Epoch Capabilities Index. */
  eci: Map<string, { score: number; date: string | null }>;
};

/** RFC 4180 CSV: quoted fields may hold commas, quotes and newlines. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows;
  if (!head) return [];
  return body
    .filter((r) => r.some((x) => x !== ""))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

export const normalizeId = (id: string) => id.toLowerCase().replace(/\./g, "-");

/** `gpt-5.4-2026-03-05_xhigh` -> { id: "gpt-5-4", setting: "xhigh" }; dated snapshots match their undated page. */
export function splitVersion(version: string): {
  id: string;
  setting: string | null;
} {
  const [id, setting] = version.split("_");
  return {
    id: normalizeId(
      id.replace(/-\d{4}-\d{2}-\d{2}$/, "").replace(/-\d{8}$/, ""),
    ),
    setting: setting && setting !== "unknown" ? setting : null,
  };
}

export function parseBenchmarkZip(zip: Uint8Array): BenchmarkData {
  const files = unzipSync(zip);
  const read = (name: string) => {
    const key = Object.keys(files).find(
      (k) => k === name || k.endsWith(`/${name}`),
    );
    return key ? strFromU8(files[key]) : null;
  };
  // Each file's score column and scale, from Epoch's own metadata; a benchmark without them is skipped.
  const meta = new Map(
    parseCsv(read("benchmark_metadata.csv") ?? "")
      .filter((m) => m.source_file)
      .map((m) => [
        m.source_file,
        { column: m.score_column, scale: Number(m.scale) || 1 },
      ]),
  );
  const runs = new Map<string, Map<string, Score>>();
  for (const b of BENCHMARKS) {
    const csv = read(b.file);
    const m = meta.get(b.file);
    if (!csv || !m?.column) continue;
    for (const row of parseCsv(csv)) {
      const raw = (row[m.column] ?? "").trim();
      const value = Number(raw) / m.scale;
      if (!row["Model version"] || !raw || !Number.isFinite(value)) continue;
      const { id, setting } = splitVersion(row["Model version"]);
      const date =
        (
          row["Started at"] ||
          row["Date of evaluation"] ||
          row["Date added"] ||
          ""
        ).slice(0, 10) || null;
      const byBench = runs.get(id) ?? new Map<string, Score>();
      const prev = byBench.get(b.name);
      // A model is often run at several reasoning settings: keep its best, and say which setting that was.
      if (!prev || value > prev.score)
        byBench.set(b.name, {
          benchmark: b.name,
          url: b.url,
          category: b.category,
          epoch: !!b.epoch,
          score: value,
          setting,
          date,
        });
      runs.set(id, byBench);
    }
  }
  const eci = new Map<string, { score: number; date: string | null }>();
  const eciCsv = read("eci_scores.csv");
  for (const row of eciCsv ? parseCsv(eciCsv) : []) {
    const score = Number(row.eci);
    if (row.Model && Number.isFinite(score))
      eci.set(row.Model.toLowerCase(), { score, date: row.date || null });
  }
  return { runs, eci };
}

/**
 * Scores for one model page. `ids` are the page's model ids, most specific first (its slug, the headline
 * listing's bare id, then each other listing's); each benchmark takes the first id Epoch has a score for, so
 * an older or newer snapshot sharing the page never stands in for the model itself. `names` are its display
 * names. Returns null when Epoch has nothing for it.
 */
export function benchmarksFor(
  data: BenchmarkData | null,
  ids: string[],
  names: string[],
): ModelBenchmarks | null {
  if (!data) return null;
  const scores = new Map<string, Score>();
  for (const id of new Set(ids.map(normalizeId))) {
    for (const [name, s] of data.runs.get(id) ?? []) {
      if (!scores.has(name)) scores.set(name, s);
    }
  }
  const eci = names.map((n) => data.eci.get(n.toLowerCase())).find(Boolean);
  if (!scores.size && !eci) return null;
  const order = BENCHMARKS.map((b) => b.name);
  return {
    eci,
    scores: [...scores.values()].sort(
      (a, b) => order.indexOf(a.benchmark) - order.indexOf(b.benchmark),
    ),
  };
}

export async function loadBenchmarks(
  fetchBuffer: (url: string) => Promise<Uint8Array>,
): Promise<BenchmarkData | null> {
  try {
    return parseBenchmarkZip(await fetchBuffer(EPOCH_DATA_URL));
  } catch (err) {
    console.warn(
      "seo: Epoch AI benchmark data unavailable; comparison pages are built without scores",
      err,
    );
    return null;
  }
}
