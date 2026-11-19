import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CATALOG_URL,
  MANIFEST_URL,
  loadCatalog,
  parseCatalog,
  selectModels,
} from "../lib/catalog.mjs";

const NOW = Date.parse("2026-11-19T18:00:00Z");
const HOUR = 60 * 60 * 1000;

function feeds() {
  return {
    catalog: {
      models: {
        "example-1": {
          n: "Example 1",
          lab: "OpenAI",
          in: 0.15,
          out: 0.6,
          ctx: 128_000,
          mo: 16_000,
          f: { tools: 1, reason: 0 },
          by: "OpenAI",
          add: "2026-10",
        },
      },
      // This is benchmark freshness, not the catalog build date.
      asOf: "November 1, 2026",
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
      },
    },
  };
}

async function temporaryCache(t) {
  const directory = await mkdtemp(join(tmpdir(), "prism-catalog-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function saveCache(directory, data = feeds(), fetchedAt = NOW) {
  await writeFile(
    join(directory, "catalog-v1.json"),
    JSON.stringify({ ...data, fetchedAt: new Date(fetchedAt).toISOString() }),
  );
}

function catalogFetch(data = feeds()) {
  const calls = [];
  return {
    calls,
    fetchFn: async (url, options) => {
      calls.push(url);
      assert.ok(options.signal instanceof AbortSignal);
      assert.ok([CATALOG_URL, MANIFEST_URL].includes(url));
      return {
        ok: true,
        json: async () => (url === CATALOG_URL ? data.catalog : data.manifest),
      };
    },
  };
}

test("normalizes source prices without rescaling and preserves feature uncertainty", () => {
  const { catalog, manifest } = feeds();
  const result = parseCatalog(catalog, manifest);
  assert.equal(result.buildDate, "2026-11-19");
  assert.deepEqual(result.models, [
    {
      id: "example-1",
      modelId: "openai/example-1",
      name: "Example 1",
      lab: "OpenAI",
      input: 0.15,
      output: 0.6,
      context: 128_000,
      maxOutput: 16_000,
      features: { tools: true, reason: false, vision: null },
      provider: "OpenAI",
      added: "2026-11-18",
      url: "https://models.litellm.ai/models/example-1",
    },
  ]);
});

test("keeps zero prices and output limits rather than treating them as missing", () => {
  const { catalog, manifest } = feeds();
  Object.assign(catalog.models["example-1"], { in: 0, out: 0, mo: 0 });
  const [model] = parseCatalog(catalog, manifest).models;
  assert.equal(model.input, 0);
  assert.equal(model.output, 0);
  assert.equal(model.maxOutput, 0);
});

test("only includes active text models that have matching manifest metadata", () => {
  const { catalog, manifest } = feeds();
  for (const [slug, meta] of Object.entries({
    responses: { status: "active", mode: "responses" },
    completion: { status: "active", mode: "completion" },
    retired: { status: "retired", mode: "chat" },
    deprecated: { status: "deprecated", mode: "chat" },
    image: { status: "active", mode: "image_generation" },
    embedding: { status: "active", mode: "embedding" },
    unknown: { mode: "chat" },
  })) {
    catalog.models[slug] = { ...catalog.models["example-1"], n: slug };
    manifest.models[slug] = meta;
  }
  catalog.models.orphan = { ...catalog.models["example-1"], n: "Orphan" };
  assert.deepEqual(
    parseCatalog(catalog, manifest).models.map((model) => model.id),
    ["example-1", "responses", "completion"],
  );
});

test("drops invalid rows, including terminal control sequences and invalid numeric fields", () => {
  const { catalog, manifest } = feeds();
  const invalid = [
    { in: -1 },
    { out: "0.6" },
    { ctx: Infinity },
    { f: [] },
    { n: "Injected\u001b[31m" },
    { lab: null },
    { by: "" },
  ];
  for (const [index, patch] of invalid.entries()) {
    const id = `invalid-${index}`;
    catalog.models[id] = { ...catalog.models["example-1"], ...patch };
    manifest.models[id] = { status: "active", mode: "chat" };
  }
  catalog.models["bad/slug"] = catalog.models["example-1"];
  manifest.models["bad/slug"] = { status: "active", mode: "chat" };
  assert.deepEqual(
    parseCatalog(catalog, manifest).models.map((model) => model.id),
    ["example-1"],
  );
});

test("handles absent metadata without inventing model identifiers, dates or capability support", () => {
  const { catalog, manifest } = feeds();
  Object.assign(catalog.models["example-1"], {
    mo: undefined,
    f: { tools: true, reason: "1", vision: 0 },
  });
  Object.assign(manifest.models["example-1"], {
    modelId: "bad\nidentifier",
    firstSeen: "unknown",
  });
  const [model] = parseCatalog(catalog, manifest).models;
  assert.equal(model.modelId, null);
  assert.equal(model.added, "2026-10");
  assert.equal(model.maxOutput, null);
  assert.deepEqual(model.features, {
    tools: null,
    reason: null,
    vision: false,
  });
  delete catalog.models["example-1"].add;
  assert.equal(parseCatalog(catalog, manifest).models[0].added, null);
});

test("rejects unsupported or empty feeds", () => {
  const { catalog, manifest } = feeds();
  for (const args of [
    [null, manifest],
    [catalog, null],
    [{ models: [] }, manifest],
    [catalog, { ...manifest, buildDate: "unknown" }],
  ]) {
    assert.throws(() => parseCatalog(...args), /unsupported format/);
  }
  assert.throws(
    () => parseCatalog({ models: {} }, manifest),
    /no active text models/,
  );
});

function selectionModels() {
  return ["OpenAI", "Anthropic", "Google", "DeepSeek"].flatMap(
    (lab, labIndex) =>
      Array.from({ length: 7 }, (_, index) => ({
        id: `${lab.toLowerCase()}-${index + 1}`,
        modelId: `${lab.toLowerCase()}/model-${index + 1}`,
        name: `Model ${index + 1}`,
        lab,
        input: 10 - index + labIndex,
        output: index + 1,
        context: (index + 1) * 1000,
        added: `2026-11-${String(index + 1).padStart(2, "0")}`,
      })),
  );
}

function select(models, overrides = {}) {
  return selectModels(models, { labs: [], query: "", ...overrides });
}

test("default overview shows five recent additions from each of the three reference labs", () => {
  const original = selectionModels();
  const result = select(original);
  assert.equal(result.total, 21);
  assert.equal(result.limited, true);
  assert.deepEqual(
    result.models.map((model) => model.id),
    ["openai", "anthropic", "google"].flatMap((lab) =>
      [7, 6, 5, 4, 3].map((n) => `${lab}-${n}`),
    ),
  );
  assert.equal(original[0].id, "openai-1");
});

test("all removes the overview lab and history restrictions", () => {
  const result = select(selectionModels(), { all: true });
  assert.equal(result.models.length, 28);
  assert.equal(result.total, 28);
  assert.equal(result.limited, false);
  assert.ok(result.models.some((model) => model.lab === "DeepSeek"));
});

test("lab filters are case-insensitive and search spans ids, model ids, names and labs", () => {
  const models = selectionModels();
  assert.equal(select(models, { labs: ["dEePsEeK"] }).models.length, 7);
  assert.deepEqual(
    select(models, { query: "DEEPSEEK/MODEL-2" }).models.map(
      (model) => model.id,
    ),
    ["deepseek-2"],
  );
  assert.equal(select(models, { query: "Model 1" }).models.length, 4);
  assert.equal(select(models, { query: "deepseek" }).models.length, 7);
  assert.deepEqual(
    select(models, { labs: ["openai"], query: "Model 2" }).models.map(
      (model) => model.id,
    ),
    ["openai-2"],
  );
  assert.equal(select(models, { query: "absent" }).models.length, 0);
  assert.throws(() => select(models, { labs: ["not-a-lab"] }), /Unknown lab/);
});

test("limit takes newest models per lab before sorting the displayed selection", () => {
  const result = select(selectionModels(), {
    all: true,
    limit: 2,
    sort: "output",
  });
  assert.equal(result.models.length, 8);
  assert.equal(result.total, 28);
  assert.equal(result.limited, true);
  assert.ok(result.models.every((model) => /-[67]$/.test(model.id)));
  assert.deepEqual(
    result.models.map((model) => model.output),
    [6, 6, 6, 6, 7, 7, 7, 7],
  );
});

test("sorts numeric prices ascending, context descending, names naturally and additions newest first", () => {
  const models = selectionModels();
  for (const sort of ["input", "output"]) {
    const selected = select(models, { all: true, sort }).models.map(
      (model) => model[sort],
    );
    assert.deepEqual(
      selected,
      [...selected].sort((a, b) => a - b),
    );
  }
  const context = select(models, { all: true, sort: "context" }).models.map(
    (model) => model.context,
  );
  assert.deepEqual(
    context,
    [...context].sort((a, b) => b - a),
  );
  const newest = select(models, { all: true, sort: "newest" }).models.map(
    (model) => model.added,
  );
  assert.deepEqual(newest, [...newest].sort().reverse());
  const names = select(
    [
      { ...models[0], name: "Model 10", added: null },
      { ...models[1], name: "Model 2", added: null },
    ],
    { all: true, sort: "name" },
  ).models.map((model) => model.name);
  assert.deepEqual(names, ["Model 2", "Model 10"]);
});

test("fresh cached data makes no network requests", async (t) => {
  const cacheDir = await temporaryCache(t);
  await saveCache(cacheDir, feeds(), NOW - HOUR + 1);
  let requests = 0;
  const result = await loadCatalog({
    cacheDir,
    now: NOW,
    fetchFn: async () => {
      requests++;
      throw new Error("Unexpected network request");
    },
  });
  assert.equal(requests, 0);
  assert.equal(result.cached, true);
  assert.equal(result.stale, false);
  assert.equal(result.models.length, 1);
});

test("offline mode returns saved data and reports whether it has expired", async (t) => {
  const cacheDir = await temporaryCache(t);
  let requests = 0;
  const fetchFn = async () => {
    requests++;
    throw new Error("Unexpected network request");
  };
  await saveCache(cacheDir, feeds(), NOW);
  assert.equal(
    (await loadCatalog({ cacheDir, now: NOW, offline: true, fetchFn })).stale,
    false,
  );
  await saveCache(cacheDir, feeds(), NOW - HOUR);
  const stale = await loadCatalog({
    cacheDir,
    now: NOW,
    offline: true,
    fetchFn,
  });
  assert.equal(stale.cached, true);
  assert.equal(stale.stale, true);
  assert.equal(requests, 0);
});

test("offline mode without valid cache gives an actionable error without fetching", async (t) => {
  const cacheDir = await temporaryCache(t);
  let requests = 0;
  await assert.rejects(
    loadCatalog({
      cacheDir,
      now: NOW,
      offline: true,
      fetchFn: async () => {
        requests++;
      },
    }),
    /Run prism online once/,
  );
  assert.equal(requests, 0);
});

test("expired cache falls back visibly when refresh fails", async (t) => {
  const cacheDir = await temporaryCache(t);
  await saveCache(cacheDir, feeds(), NOW - HOUR);
  let requests = 0;
  const result = await loadCatalog({
    cacheDir,
    now: NOW,
    fetchFn: async () => {
      requests++;
      throw new Error("Offline");
    },
  });
  assert.ok(requests > 0);
  assert.equal(result.cached, true);
  assert.equal(result.stale, true);
  assert.equal(result.models[0].input, 0.15);
});

test("refresh bypasses a fresh cache and persists both validated feeds", async (t) => {
  const cacheDir = await temporaryCache(t);
  await saveCache(cacheDir);
  const next = feeds();
  next.catalog.models["example-1"].in = 0.25;
  const stub = catalogFetch(next);
  const result = await loadCatalog({
    cacheDir,
    now: NOW + 1000,
    refresh: true,
    fetchFn: stub.fetchFn,
  });
  assert.deepEqual(stub.calls.sort(), [CATALOG_URL, MANIFEST_URL].sort());
  assert.equal(result.cached, false);
  assert.equal(result.stale, false);
  assert.equal(result.models[0].input, 0.25);
  const persisted = JSON.parse(
    await readFile(join(cacheDir, "catalog-v1.json"), "utf8"),
  );
  assert.deepEqual(persisted.catalog, next.catalog);
  assert.deepEqual(persisted.manifest, next.manifest);
  assert.equal(persisted.fetchedAt, new Date(NOW + 1000).toISOString());
  const saved = await loadCatalog({ cacheDir, now: NOW + 2000, offline: true });
  assert.equal(saved.models[0].input, 0.25);
});

test("invalid cache contents trigger a new request instead of hiding the live catalog", async (t) => {
  const cacheDir = await temporaryCache(t);
  for (const invalid of [
    "not-json",
    JSON.stringify({ fetchedAt: "unknown" }),
    JSON.stringify({
      ...feeds(),
      catalog: { models: {} },
      fetchedAt: new Date(NOW).toISOString(),
    }),
  ]) {
    await writeFile(join(cacheDir, "catalog-v1.json"), invalid);
    const stub = catalogFetch();
    const result = await loadCatalog({
      cacheDir,
      now: NOW,
      fetchFn: stub.fetchFn,
    });
    assert.equal(stub.calls.length, 2);
    assert.equal(result.cached, false);
    assert.equal(result.models.length, 1);
  }
});

test("unusable network data preserves the last good cache", async (t) => {
  const cacheDir = await temporaryCache(t);
  await saveCache(cacheDir, feeds(), NOW - HOUR);
  const stub = catalogFetch({ ...feeds(), catalog: { models: {} } });
  const result = await loadCatalog({
    cacheDir,
    now: NOW,
    fetchFn: stub.fetchFn,
  });
  assert.equal(result.stale, true);
  assert.equal(result.models.length, 1);
  const persisted = JSON.parse(
    await readFile(join(cacheDir, "catalog-v1.json"), "utf8"),
  );
  assert.ok(persisted.catalog.models["example-1"]);
});

test("initial HTTP or format failures produce a concise connection error", async (t) => {
  const cacheDir = await temporaryCache(t);
  await assert.rejects(
    loadCatalog({
      cacheDir,
      now: NOW,
      fetchFn: async () => ({ ok: false, status: 503 }),
    }),
    /Could not load LiteLLM's catalog/,
  );
  await assert.rejects(
    loadCatalog({
      cacheDir,
      now: NOW,
      fetchFn: catalogFetch({ ...feeds(), manifest: {} }).fetchFn,
    }),
    /Could not load LiteLLM's catalog/,
  );
});
