import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { renderLineup } from "../lib/render.mjs";

const entry = (label) => ({ label, model: { id: label.toLowerCase() } });
const row = (lab, family, tiers) => ({ lab, family, tiers });
const rows = [
  row("Google", "Gemini 4 · 1", { l: [entry("Argon")] }),
  row("Google", "Gemini 4 · 2", {
    l: [entry("Carbon")],
    mp: [entry("Neon")],
    m: [entry("Hydrogen")],
  }),
  row("Anthropic", "Claude 5.2", { xl: [entry("Fable"), entry("Mythos")] }),
  row("Anthropic", "Claude 5.5", {
    l: [entry("Opus")],
    m: [entry("Sonnet")],
    s: [entry("Haiku")],
  }),
  row("OpenAI", "GPT 6.2", { xl: [entry("Astra")], l: [entry("Sol")] }),
  row("OpenAI", "GPT 6.1", { m: [entry("Terra")] }),
  row("OpenAI", "GPT 6", { s: [entry("Luna")] }),
];
const options = {
  color: false,
  width: 120,
  version: "0.1.0",
  fetchedAt: "2026-11-19T18:12:00.000Z",
  buildDate: "2026-11-19",
  cached: false,
  stale: false,
};

test("lineup renders the complete reference matrix with all thirteen live entries", () => {
  const output = renderLineup(rows, options);
  assert.match(output, /LAB\s+FAMILY\s+XL\s+L\s+M\+\s+M\s+S\/XS/);
  assert.match(output, /Gemini 4 · 1\s+Argon/);
  assert.match(output, /Gemini 4 · 2\s+Carbon\s+Neon\s+Hydrogen/);
  assert.match(output, /Claude 5\.2\s+Fable \/ Mythos/);
  assert.match(output, /Claude 5\.5\s+Opus\s+Sonnet\s+Haiku/);
  assert.match(output, /GPT 6\.2\s+Astra\s+Sol/);
  assert.match(output, /GPT 6\.1\s+Terra/);
  assert.match(output, /GPT 6\s+Luna/);
  assert.match(output, /13 models · 3 labs/);
  assert.match(output, /Curated size tiers · models from LiteLLM/);
  assert.match(output, /prism --table  prices & context/);
});

test("lineup names each lab once and leaves space between lab groups", () => {
  const output = renderLineup(rows, options);
  for (const lab of ["Google", "Anthropic", "OpenAI"])
    assert.equal(output.split(lab).length - 1, 1);
  assert.match(output, /Hydrogen[^\n]*\n\nAnthropic/);
  assert.match(output, /Haiku[^\n]*\n\nOpenAI/);
  assert.doesNotMatch(output, /\|/);
});

test("compact lineup preserves every model and family without width overflow", () => {
  for (const width of [10, 20, 40, 64, 80, 98, 99, 100, 120, 160]) {
    for (const color of [false, true]) {
      const output = stripVTControlCharacters(
        renderLineup(rows, { ...options, width, color }),
      );
      assert.ok(
        output.split("\n").every((line) => [...line].length <= width),
        `width ${width}`,
      );
      for (const label of [
        "Argon",
        "Carbon",
        "Neon",
        "Hydrogen",
        "Fable",
        "Mythos",
        "Opus",
        "Sonnet",
        "Haiku",
        "Astra",
        "Sol",
        "Terra",
        "Luna",
      ])
        assert.ok(output.includes(label), `${label} at width ${width}`);
    }
  }
  const output = renderLineup(rows, { ...options, width: 80 });
  assert.match(output, /Google\nGemini 4 · 1\nL  Argon/);
  assert.match(output, /XL  Fable \/ Mythos/);
  assert.match(output, /S\/XS  Luna/);
});

test("long labels fall back to wrapping without deleting their text", () => {
  const label = "An extraordinarily long model label with several words";
  const output = renderLineup(
    [row("Example Laboratory", "Example model family", { xl: [entry(label)] })],
    { ...options, width: 40 },
  );
  assert.ok(output.split("\n").every((line) => [...line].length <= 40));
  assert.ok(output.replace(/\s+/g, " ").includes(label));
  assert.match(output, /1 model · 1 lab/);
});

test("lineup color codes are optional and do not change the visible matrix", () => {
  const plain = renderLineup(rows, options);
  const color = renderLineup(rows, { ...options, color: true });
  assert.doesNotMatch(plain, /\u001b/);
  assert.match(color, /\u001b\[38;2;214;137;255m/);
  assert.equal(stripVTControlCharacters(color), plain);
});

test("lineup shows fetch and cache times without presenting cache data as fresh", () => {
  const fresh = renderLineup(rows, options);
  assert.match(fresh, /Fetched 2026-11-19 18:12 UTC/);
  assert.doesNotMatch(fresh, /Cached|refresh unavailable/);
  const saved = renderLineup(rows, { ...options, cached: true, stale: true });
  assert.match(saved, /Cached 2026-11-19 18:12 UTC/);
  assert.match(saved, /Saved catalog · refresh unavailable/);
  assert.doesNotMatch(saved, /Fetched/);
});

test("empty lineup offers the table as a recovery path", () => {
  const output = renderLineup([], options);
  assert.match(output, /No models match this lineup/);
  assert.match(output, /prism --table --all/);
  assert.match(output, /0 models · 0 labs/);
});
