import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cliDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const entrypoint = join(cliDirectory, "bin/prism.mjs");
const { version } = JSON.parse(
  await readFile(join(cliDirectory, "package.json"), "utf8"),
);

function run(args, environment = {}) {
  return spawnSync(process.execPath, [entrypoint, ...args], {
    encoding: "utf8",
    timeout: 5000,
    env: { ...process.env, ...environment },
  });
}

test("help and version are available without loading the catalog", () => {
  const help = run(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: prism/);
  assert.match(help.stdout, /USD per 1M tokens/);
  assert.equal(help.stderr, "");
  const result = run(["--version"]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${version}\n`);
  assert.equal(result.stderr, "");
});

test("invalid arguments fail before any catalog request", () => {
  for (const [args, message] of [
    [["--sort", "quality"], /--sort must be/],
    [["--limit", "0"], /positive whole number/],
    [["--limit", "2.5"], /positive whole number/],
    [["--limit", "9007199254740992"], /positive whole number/],
    [["--lab", " , "], /lab name/],
    [["--refresh", "--offline"], /either --refresh or --offline/],
    [["--unknown"], /Unknown option/],
  ]) {
    const result = run(args);
    assert.equal(result.status, 1, args.join(" "));
    assert.equal(result.stdout, "");
    assert.match(result.stderr, message);
    assert.match(result.stderr, /Run prism --help/);
  }
});

async function savedCatalog(t) {
  const directory = await mkdtemp(join(tmpdir(), "prism-cli-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, "prism"));
  await writeFile(
    join(directory, "prism/catalog-v1.json"),
    JSON.stringify({
      fetchedAt: new Date().toISOString(),
      catalog: {
        models: {
          "example-1": {
            n: "Example 1",
            lab: "OpenAI",
            in: 0,
            out: 0.6,
            ctx: 128_000,
            mo: 16_000,
            f: { tools: 1, reason: 0 },
            by: "OpenAI",
          },
          "example-2": {
            n: "Example 2",
            lab: "Google",
            in: 0.1,
            out: 0.4,
            ctx: 1_000_000,
            f: { tools: 1, vision: 1 },
            by: "Google AI Studio",
          },
        },
      },
      manifest: {
        buildDate: "2026-11-19",
        models: {
          "example-1": {
            status: "active",
            mode: "chat",
            modelId: "openai/example-1",
            firstSeen: "2026-11-18",
          },
          "example-2": {
            status: "active",
            mode: "chat",
            modelId: "gemini/example-2",
            firstSeen: "2026-11-19",
          },
        },
      },
    }),
  );
  return { XDG_CACHE_HOME: directory };
}

async function savedLineupCatalog(t) {
  const environment = await savedCatalog(t);
  const path = join(environment.XDG_CACHE_HOME, "prism/catalog-v1.json");
  const data = JSON.parse(await readFile(path, "utf8"));
  data.catalog.models = {};
  data.manifest.models = {};
  for (const [id, name, lab] of [
    ["gemini-4-argon", "Gemini 4 Argon", "Google"],
    ["claude-opus-5-5", "Claude Opus 5.5", "Anthropic"],
    ["gpt-6.1-terra", "GPT 6.1 Terra", "OpenAI"],
  ]) {
    data.catalog.models[id] = {
      n: name,
      lab,
      in: 1,
      out: 2,
      ctx: 128_000,
      f: {},
      by: lab,
    };
    data.manifest.models[id] = {
      status: "active",
      mode: "chat",
      modelId: id,
      firstSeen: "2026-11-19",
    };
  }
  await writeFile(path, JSON.stringify(data));
  return environment;
}

test("the default command shows the family size matrix and JSON identifies its curated tiers", async (t) => {
  const environment = await savedLineupCatalog(t);
  const table = run(["--offline", "--no-color"], environment);
  assert.equal(table.status, 0);
  for (const label of ["XL", "M+", "S/XS", "Argon", "Opus", "Terra"]) {
    assert.ok(table.stdout.includes(label), `Missing ${label}`);
  }
  assert.doesNotMatch(table.stdout, /INPUT\s+OUTPUT/);
  assert.doesNotMatch(table.stdout, /\u001b\[/);
  const result = run(["--offline", "--json"], environment);
  assert.equal(result.status, 0);
  const data = JSON.parse(result.stdout);
  assert.equal(data.view, "lineup");
  assert.equal(data.tiers, "curated");
  assert.deepEqual(
    data.rows.map(({ lab, family }) => [lab, family]),
    [
      ["Google", "Gemini 4"],
      ["Anthropic", "Claude 5.5"],
      ["OpenAI", "GPT 6.1"],
    ],
  );
  assert.equal(data.models.length, 3);
});

test("--table explicitly opens the detailed pricing table", async (t) => {
  const environment = await savedLineupCatalog(t);
  const result = run(["--offline", "--table"], environment);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /INPUT\s+OUTPUT\s+CONTEXT/);
  assert.match(result.stdout, /Claude Opus 5\.5/);
  const json = run(["--offline", "--table", "--json"], environment);
  assert.equal(json.status, 0);
  const data = JSON.parse(json.stdout);
  assert.equal(data.view, "table");
  assert.equal(data.models.length, 3);
  assert.ok(!("rows" in data));
});

test("offline JSON output preserves exact values and identifies its data source", async (t) => {
  const environment = await savedCatalog(t);
  const result = run(["--offline", "--json", "--lab", "openai"], environment);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  const data = JSON.parse(result.stdout);
  assert.equal(data.source, "https://models.litellm.ai");
  assert.equal(data.pricingUnit, "USD per 1M tokens");
  assert.equal(data.cached, true);
  assert.equal(data.stale, false);
  assert.equal(data.models.length, 1);
  assert.equal(data.models[0].input, 0);
  assert.equal(data.models[0].context, 128_000);
  assert.equal(data.models[0].modelId, "openai/example-1");
  assert.deepEqual(data.models[0].features, {
    tools: true,
    reason: false,
    vision: null,
  });
});

test("table output is usable when piped and respects comma-separated lab filters", async (t) => {
  const environment = await savedCatalog(t);
  const result = run(
    ["--offline", "--lab", "openai,google", "--no-color"],
    environment,
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Example 1/);
  assert.match(result.stdout, /Example 2/);
  assert.match(result.stdout, /USD \/ 1M tokens/);
  assert.doesNotMatch(result.stdout, /\u001b\[/);
});

test("an empty search succeeds with an explanatory table and unknown labs fail", async (t) => {
  const environment = await savedCatalog(t);
  const empty = run(["--offline", "nonexistent"], environment);
  assert.equal(empty.status, 0);
  assert.match(empty.stdout, /No models match/);
  const invalid = run(["--offline", "--lab", "nonexistent"], environment);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Unknown lab/);
});

test("closing a downstream pipe early exits without an EPIPE stack trace", async (t) => {
  const environment = await savedCatalog(t);
  const child = spawn(process.execPath, [entrypoint, "--offline", "--json"], {
    env: { ...process.env, ...environment },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const exited = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal }));
  });
  child.stdout.destroy();
  const timeout = setTimeout(() => child.kill(), 5000);
  t.after(() => clearTimeout(timeout));
  const result = await exited;
  assert.equal(result.signal, null);
  assert.equal(result.code, 0);
  assert.equal(stderr, "");
});
