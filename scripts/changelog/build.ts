import {
  catalogChanges,
  type CatalogMap,
  type CatalogUpdate,
} from "../../src/discoveryChangelog";
export interface CatalogCommit {
  sha: string;
  parent: string;
  timestamp: string;
  subject: string;
}
export interface ChangelogData {
  version: 1;
  generatedAt: string;
  through: string;
  since: string;
  timezone: string;
  head: string;
  commits: string[];
  providerNames: Record<string, string>;
  updates: CatalogUpdate[];
}
export interface PreviousData {
  updates: CatalogUpdate[];
  commits?: string[];
}
/** History is enumerated first-parent by git; immutable raw files supply the values.
 * Reuse previously published diffs by commit SHA; never reuse a mutable main blob.
 * A missing or invalid upstream blob fails the build rather than publishing gaps.
 */
export async function buildChangelog(options: {
  commits: CatalogCommit[];
  previous: PreviousData[];
  loadCatalog: (sha: string) => Promise<CatalogMap>;
  providerNames: Record<string, string>;
  head: string;
  since: string;
  now: string;
}): Promise<ChangelogData> {
  const { commits, previous, loadCatalog, providerNames } = options;
  const cached = new Map<string, CatalogUpdate[]>();
  for (const data of previous) {
    for (const sha of data.commits ?? []) cached.set(sha, []);
    for (const update of data.updates) {
      const sha = update.source.split("/").pop()!;
      const list = cached.get(sha) ?? [];
      if (!list.some((u) => u.id === update.id)) list.push(update);
      cached.set(sha, list);
    }
  }
  const results: CatalogUpdate[][] = new Array(commits.length);
  let cursor = 0;
  // Limit concurrency and release full catalog blobs immediately after each diff.
  await Promise.all(
    Array.from({ length: Math.min(4, commits.length) }, async () => {
      while (cursor < commits.length) {
        const index = cursor++,
          commit = commits[index];
        if (cached.has(commit.sha)) {
          results[index] = cached.get(commit.sha)!;
          continue;
        }
        const [before, after] = await Promise.all([
          loadCatalog(commit.parent),
          loadCatalog(commit.sha),
        ]);
        results[index] = catalogChanges(before, after, commit, providerNames);
      }
    }),
  );
  const updates = results
    .flat()
    .sort(
      (a, b) =>
        Date.parse(b.timestamp) - Date.parse(a.timestamp) ||
        a.id.localeCompare(b.id),
    );
  return {
    version: 1,
    generatedAt: options.now,
    through: commits[0]?.timestamp ?? options.now,
    since: options.since,
    timezone: "America/Los_Angeles",
    head: options.head,
    commits: commits.map((c) => c.sha),
    providerNames,
    updates,
  };
}
