import assert from "node:assert/strict";
import test from "node:test";
import { parseCatalog } from "../lib/catalog.mjs";
import { buildLineup } from "../lib/lineup.mjs";

const models = [
  ["gemini-4-argon", "Google"],
  ["gemini-4-carbon", "Google"],
  ["gemini-4-neon", "Google"],
  ["gemini-4-hydrogen", "Google"],
  ["claude-fable-5-2", "Anthropic"],
  ["claude-mythos-5-2", "Anthropic"],
  ["claude-opus-5-5", "Anthropic"],
  ["claude-sonnet-5-5", "Anthropic"],
  ["claude-haiku-5-5", "Anthropic"],
  ["gpt-6.2-astra", "OpenAI"],
  ["gpt-6.2-sol", "OpenAI"],
  ["gpt-6.1-terra", "OpenAI"],
  ["gpt-6-luna", "OpenAI"],
].map(([id, lab]) => ({ id, lab, name: id }));

function cells(row) {
  return Object.fromEntries(
    Object.entries(row.tiers).map(([tier, entries]) => [
      tier,
      entries.map(({ label, model }) => `${label}:${model.id}`),
    ]),
  );
}

test("maps exact catalog models into the seven requested lab and family rows", () => {
  const result = buildLineup([...models].reverse());
  assert.deepEqual(
    result.map((row) => ({ lab: row.lab, family: row.family, ...cells(row) })),
    [
      {
        lab: "Google",
        family: "Gemini 4",
        xl: [],
        l: ["Argon:gemini-4-argon"],
        mp: [],
        m: [],
        s: [],
      },
      {
        lab: "Google",
        family: "Gemini 4",
        xl: [],
        l: ["Carbon:gemini-4-carbon"],
        mp: ["Neon:gemini-4-neon"],
        m: ["Hydrogen:gemini-4-hydrogen"],
        s: [],
      },
      {
        lab: "Anthropic",
        family: "Claude 5.2",
        xl: ["Fable:claude-fable-5-2", "Mythos:claude-mythos-5-2"],
        l: [],
        mp: [],
        m: [],
        s: [],
      },
      {
        lab: "Anthropic",
        family: "Claude 5.5",
        xl: [],
        l: ["Opus:claude-opus-5-5"],
        mp: [],
        m: ["Sonnet:claude-sonnet-5-5"],
        s: ["Haiku:claude-haiku-5-5"],
      },
      {
        lab: "OpenAI",
        family: "GPT 6.2",
        xl: ["Astra:gpt-6.2-astra"],
        l: ["Sol:gpt-6.2-sol"],
        mp: [],
        m: [],
        s: [],
      },
      {
        lab: "OpenAI",
        family: "GPT 6.1",
        xl: [],
        l: [],
        mp: [],
        m: ["Terra:gpt-6.1-terra"],
        s: [],
      },
      {
        lab: "OpenAI",
        family: "GPT 6",
        xl: [],
        l: [],
        mp: [],
        m: [],
        s: ["Luna:gpt-6-luna"],
      },
    ],
  );
  assert.equal(
    result.flatMap((row) => Object.values(row.tiers).flat()).length,
    13,
  );
  const displayed = result[0].tiers.l[0].model;
  assert.equal(displayed, models[0]);
});

test("leaves absent tiers empty and drops rows without available catalog models", () => {
  const result = buildLineup(
    models.filter((model) => model.id === "gemini-4-neon"),
  );
  assert.equal(result.length, 1);
  assert.deepEqual(cells(result[0]), {
    xl: [],
    l: [],
    mp: ["Neon:gemini-4-neon"],
    m: [],
    s: [],
  });
  assert.deepEqual(buildLineup([]), []);
});

test("requires exact model ids instead of substituting fast, cyber or law variants", () => {
  const variants = [
    { id: "claude-fable-5-2-fast", lab: "Anthropic" },
    { id: "claude-opus-5-5-fast", lab: "Anthropic" },
    { id: "gpt-6.2-astra-cyber", lab: "OpenAI" },
    { id: "gpt-6.1-terra-law", lab: "OpenAI" },
    { id: "gpt-6.2-sol-pro", lab: "OpenAI" },
  ];
  assert.deepEqual(buildLineup(variants), []);
  const result = buildLineup([models[4], ...variants]);
  assert.equal(result.length, 1);
  assert.deepEqual(cells(result[0]).xl, ["Fable:claude-fable-5-2"]);
});

test("skips exact ids attributed to a different lab", () => {
  const wrongLab = models.map((model) => ({ ...model, lab: "Other lab" }));
  assert.deepEqual(buildLineup(wrongLab), []);
});

test("retired and unavailable models removed by catalog parsing never appear in the lineup", () => {
  const catalog = { models: {} };
  const manifest = { buildDate: "2026-11-19", models: {} };
  for (const model of models) {
    catalog.models[model.id] = {
      n: model.name,
      lab: model.lab,
      in: 1,
      out: 2,
      ctx: 128_000,
      f: {},
      by: model.lab,
    };
    manifest.models[model.id] = { status: "active", mode: "chat" };
  }
  manifest.models["claude-mythos-5-2"].status = "retired";
  delete manifest.models["gpt-6.2-astra"];
  const parsed = parseCatalog(catalog, manifest);
  const result = buildLineup(parsed.models);
  const ids = result.flatMap((row) =>
    Object.values(row.tiers).flatMap((entries) =>
      entries.map(({ model }) => model.id),
    ),
  );
  assert.equal(ids.length, 11);
  assert.ok(!ids.includes("claude-mythos-5-2"));
  assert.ok(!ids.includes("gpt-6.2-astra"));
  assert.deepEqual(
    result
      .find((row) => row.family === "Claude 5.2")
      .tiers.xl.map(({ label }) => label),
    ["Fable"],
  );
  assert.deepEqual(result.find((row) => row.family === "GPT 6.2").tiers.xl, []);
});
