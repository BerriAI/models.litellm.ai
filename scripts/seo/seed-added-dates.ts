/**
 * Rebuilds scripts/seo/added-dates.json: the date each model first appeared in
 * LiteLLM's price file, read from the file's git history in BerriAI/litellm.
 * New models after this seed get their date from the build manifest instead,
 * so this only needs re-running if the grouping rules change.
 *
 * Samples one commit per day for the last DAILY_DAYS days (exact dates) and one
 * per week before that (month precision). Models already present in the first
 * version of the file get no date.
 *
 * Run: GITHUB_TOKEN=$(gh auth token) npx vite-node scripts/seo/seed-added-dates.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { groupCostMap, type CostMap, type Overrides } from "./group";

const REPO = "BerriAI/litellm";
const FILE = "model_prices_and_context_window.json";
const FIRST_COMMIT_DAY = "2023-09-06";
const DAILY_DAYS = 100;
const HERE = path.dirname(new URL(import.meta.url).pathname);

const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("Set GITHUB_TOKEN, e.g. GITHUB_TOKEN=$(gh auth token)");

const day = (d: Date) => d.toISOString().slice(0, 10);

function sampleDays(today: Date): { date: string; exact: boolean }[] {
  const out: { date: string; exact: boolean }[] = [];
  const dailyFrom = new Date(today.getTime() - DAILY_DAYS * 86_400_000);
  for (let d = new Date(`${FIRST_COMMIT_DAY}T00:00:00Z`); d < dailyFrom; d = new Date(d.getTime() + 7 * 86_400_000)) {
    out.push({ date: day(d), exact: false });
  }
  for (let d = dailyFrom; d <= today; d = new Date(d.getTime() + 86_400_000)) out.push({ date: day(d), exact: true });
  return out;
}

async function commitAt(date: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${REPO}/commits?path=${FILE}&per_page=1&until=${date}T23:59:59Z`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  const [commit] = (await res.json()) as { sha: string }[];
  return commit?.sha ?? null;
}

async function keysAt(sha: string, overrides: Overrides): Promise<Set<string>> {
  const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${sha}/${FILE}`);
  if (!res.ok) throw new Error(`file at ${sha} responded ${res.status}`);
  let map: CostMap;
  try {
    map = (await res.json()) as CostMap;
  } catch {
    return new Set(); // a few historical commits had invalid JSON
  }
  return new Set(groupCostMap(map, overrides).map((g) => g.pageKey));
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function main(): Promise<void> {
  const overrides = JSON.parse(readFileSync(path.join(HERE, "overrides.json"), "utf8")) as Overrides;
  const samples = sampleDays(new Date());
  const shas = await pool(samples, 6, (s) => commitAt(s.date));
  const bySha = new Map<string, Promise<Set<string>>>();
  const keySets = await pool(
    samples.map((s, i) => ({ ...s, sha: shas[i] })),
    6,
    async (s) => {
      if (!s.sha) return new Set<string>();
      if (!bySha.has(s.sha)) bySha.set(s.sha, keysAt(s.sha, overrides));
      return bySha.get(s.sha)!;
    },
  );

  const baseline = keySets.find((k) => k.size > 0) ?? new Set<string>();
  const added: Record<string, string> = {};
  samples.forEach((s, i) => {
    for (const key of keySets[i]) {
      if (added[key] || baseline.has(key)) continue;
      added[key] = s.exact ? s.date : s.date.slice(0, 7);
    }
  });
  const sorted = Object.fromEntries(Object.entries(added).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(path.join(HERE, "added-dates.json"), `${JSON.stringify(sorted, null, 1)}\n`);
  console.log(`seed: ${samples.length} samples, ${bySha.size} distinct commits, ${Object.keys(sorted).length} models dated`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
