/** Regenerate the page and RSS on every build, including Vercel deploy-hook builds. */
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildChangelog,
  type CatalogCommit,
  type ChangelogData,
  type PreviousData,
} from "./build";
import { providerName } from "../seo/providers";
import { fetchText } from "../seo/fetch";
import { changelogItems, changelogRss } from "../../src/changelogPresentation";

const file = "model_prices_and_context_window.json";
const now = new Date();
const since = new Date(now.getTime() - 30 * 86400000).toISOString();
const historySince = new Date(now.getTime() - 45 * 86400000).toISOString();
const scratch = mkdtempSync(path.join(tmpdir(), "litellm-changelog-"));
try {
  const repo = process.env.CHANGELOG_REPO || path.join(scratch, "history.git");
  if (!process.env.CHANGELOG_REPO) {
    // Trees and commits only, no checkout and no repository source blobs.
    execFileSync(
      "git",
      [
        "clone",
        "--quiet",
        "--bare",
        "--filter=blob:none",
        "--single-branch",
        "--branch",
        "main",
        `--shallow-since=${historySince}`,
        "https://github.com/BerriAI/litellm.git",
        repo,
      ],
      { stdio: ["ignore", "pipe", "pipe"], timeout: 180000 },
    );
  }
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60000,
    });
  const ref = process.env.CHANGELOG_REPO ? "origin/main" : "HEAD";
  const head = git("rev-parse", "--verify", `${ref}^{commit}`).trim();
  const commits: CatalogCommit[] = git(
    "log",
    head,
    "--first-parent",
    `--since=${since}`,
    "--format=%H%x09%P%x09%cI%x09%s",
    "--",
    file,
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, parents, timestamp, ...subject] = line.split("\t");
      const parent = parents.split(" ")[0];
      if (!/^[a-f0-9]{40}$/.test(parent))
        throw new Error("Catalog history is truncated; cannot read a parent.");
      return { sha, parent, timestamp, subject: subject.join("\t") };
    });
  const raw = (sha: string, name: string) =>
    process.env.CHANGELOG_REPO
      ? Promise.resolve(git("show", `${sha}:${name}`))
      : fetchText(
          `https://raw.githubusercontent.com/BerriAI/litellm/${sha}/${name}`,
        );
  const support = JSON.parse(
    await raw(head, "provider_endpoints_support.json"),
  );
  const providerNames = Object.fromEntries(
    Object.keys(support.providers ?? {}).map((id) => [
      id,
      providerName(id, support),
    ]),
  );
  const previous: PreviousData[] = [
    JSON.parse(readFileSync("scripts/changelog/seed.json", "utf8")),
  ];
  // Published diffs are an optimization; git + immutable blobs can reconstruct them.
  const prior = await fetch("https://models.litellm.ai/changelog.json", {
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (
    prior?.ok &&
    prior.headers.get("content-type")?.includes("application/json")
  ) {
    const data = (await prior.json().catch(() => null)) as ChangelogData | null;
    if (
      data?.version === 1 &&
      Array.isArray(data.updates) &&
      Array.isArray(data.commits)
    )
      previous.push(data);
  }
  const data = await buildChangelog({
    commits,
    previous,
    head,
    since,
    now: now.toISOString(),
    providerNames,
    loadCatalog: async (sha) => JSON.parse(await raw(sha, file)),
  });
  const items = changelogItems(data.updates, data.providerNames);
  mkdirSync("public", { recursive: true });
  writeFileSync("public/changelog.json", JSON.stringify(data) + "\n");
  writeFileSync("public/changelog.xml", changelogRss(items, data.generatedAt));
  console.log(
    `Changelog: ${commits.length} catalog commits, ${items.length} entries; JSON and RSS refreshed.`,
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
