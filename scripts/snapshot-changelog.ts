/** Rebuild the review snapshot from a refreshed local BerriAI/litellm clone.
 * npx vite-node scripts/snapshot-changelog.ts -- <repo-path> <since-ISO> [ref]
 * Uses immutable parent/commit blobs; no network calls or guessed announcement dates.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { providerName } from "./seo/providers";
import { catalogChanges, type CatalogMap } from "../src/discoveryChangelog";
const separator = process.argv.indexOf("--");
const args = process.argv.slice(separator === -1 ? 2 : separator + 1);
const [repo, since, ref = "origin/main"] = args;
if (!repo || !/^\d{4}-\d{2}-\d{2}T/.test(since ?? ""))
  throw new Error(
    "Provide a local LiteLLM clone and an ISO start timestamp after --.",
  );
const git = (...args: string[]) =>
  execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
const head = git("rev-parse", "--verify", `${ref}^{commit}`).trim();
const file = "model_prices_and_context_window.json";
const support = JSON.parse(
  git("show", `${head}:provider_endpoints_support.json`),
);
const providerNames = Object.fromEntries(
  Object.keys(support.providers ?? {}).map((id) => [
    id,
    providerName(id, support),
  ]),
);
const commits = git(
  "log",
  head,
  "--first-parent",
  `--since=${since}`,
  "--format=%H%x09%cI%x09%s",
  "--",
  file,
)
  .trim()
  .split("\n")
  .filter(Boolean);
const updates = commits.flatMap((line) => {
  const [sha, timestamp, subject] = line.split("\t");
  const before = JSON.parse(git("show", `${sha}^:${file}`)) as CatalogMap;
  const after = JSON.parse(git("show", `${sha}:${file}`)) as CatalogMap;
  return catalogChanges(
    before,
    after,
    { sha, timestamp, subject },
    providerNames,
  );
});
// ISO strings can carry different UTC offsets: order by the actual instant.
updates.sort(
  (a, b) =>
    Date.parse(b.timestamp) - Date.parse(a.timestamp) ||
    a.id.localeCompare(b.id),
);
const snapshot = {
  generatedAt: new Date().toISOString(),
  through: git("show", "-s", "--format=%cI", head).trim(),
  since,
  timezone: "America/Los_Angeles",
  head,
  commitCount: commits.length,
  sourceFile: file,
  providerNames,
  updates,
};
writeFileSync(
  "src/discoveryChangelog.snapshot.json",
  JSON.stringify(snapshot) + "\n",
);
console.log(
  JSON.stringify({
    commits: commits.length,
    updates: updates.length,
    categories: Object.fromEntries(
      [...new Set(updates.map((u) => u.kind))].map((kind) => [
        kind,
        updates.filter((u) => u.kind === kind).length,
      ]),
    ),
  }),
);
