/**
 * Benchmark scores from Epoch AI's Benchmarking Hub (CC BY 4.0, credit required):
 * https://epoch.ai/benchmarks. Only Epoch's own evaluation runs and its
 * Capabilities Index are used; the hub's `*_external.csv` files carry third-party
 * licenses and are skipped.
 *
 * Matching is exact, never fuzzy: an Epoch model version (`gpt-6-astra_max`) is
 * our model id plus a reasoning setting, so the id before `_` must equal one of a
 * page's ids after normalizing dots to dashes. A wrong match would put a score on
 * the wrong model, so anything that doesn't match exactly is left out.
 */
import { unzipSync, strFromU8 } from "fflate";

export const EPOCH_DATA_URL = "https://epoch.ai/data/benchmark_data.zip";
export const EPOCH_HUB_URL = "https://epoch.ai/benchmarks";

/** Epoch's own runs shown on comparison pages, in display order. */
export const BENCHMARKS: { file: string; name: string; url: string }[] = [
  {
    file: "gpqa_diamond.csv",
    name: "GPQA Diamond",
    url: "https://epoch.ai/benchmarks/gpqa-diamond",
  },
  {
    file: "swe_bench_verified.csv",
    name: "SWE-bench Verified",
    url: "https://epoch.ai/benchmarks/swe-bench-verified",
  },
  // Tiers 1-3 v2 supersedes the original FrontierMath run (benchmark_metadata.csv `superseded_by`).
  {
    file: "frontiermath_tiers_1_3_v2.csv",
    name: "FrontierMath (tiers 1-3)",
    url: "https://epoch.ai/benchmarks/frontiermath-tiers-1-3-v2",
  },
  {
    file: "simpleqa_verified.csv",
    name: "SimpleQA Verified",
    url: "https://epoch.ai/benchmarks/simple-qa-verified",
  },
  {
    file: "otis_mock_aime_2024_2025.csv",
    name: "OTIS Mock AIME 2024-2025",
    url: "https://epoch.ai/benchmarks",
  },
];

export type Score = {
  benchmark: string;
  url: string;
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
  const runs = new Map<string, Map<string, Score>>();
  for (const b of BENCHMARKS) {
    const csv = read(b.file);
    if (!csv) continue;
    for (const row of parseCsv(csv)) {
      const value = Number(
        row["Best score (across scorers)"] || row.mean_score,
      );
      if (!row["Model version"] || !Number.isFinite(value)) continue;
      const { id, setting } = splitVersion(row["Model version"]);
      const date = (row["Started at"] || "").slice(0, 10) || null;
      const byBench = runs.get(id) ?? new Map<string, Score>();
      const prev = byBench.get(b.name);
      // A model is often run at several reasoning settings: keep its best, and say which setting that was.
      if (!prev || value > prev.score)
        byBench.set(b.name, {
          benchmark: b.name,
          url: b.url,
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
 * Scores for one model page. `ids` are the page's model ids (its slug and the bare id of each listing);
 * `names` its display names. Returns null when Epoch has nothing for it.
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
      const prev = scores.get(name);
      if (!prev || s.score > prev.score) scores.set(name, s);
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
