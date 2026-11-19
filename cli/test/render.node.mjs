import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { formatPrice, formatTokens, renderTable } from "../lib/render.mjs";

const model = {
  id: "example-model",
  name: "Example Model",
  lab: "Example Lab",
  input: 0.15,
  output: 0.6,
  context: 128_000,
  maxOutput: 16_384,
  features: { tools: true, reason: false, vision: null },
  provider: "Example Seller",
  added: "2026-11-01",
  url: "https://models.litellm.ai/models/example-model",
};

const options = {
  color: false,
  width: 120,
  version: "0.1.0",
  fetchedAt: "2026-11-19T16:23:10.000Z",
  buildDate: "2026-11-19",
  cached: false,
  stale: false,
  total: 1,
  limited: false,
};

test("wide output shows prices, token limits, and distinct capability states", () => {
  const output = renderTable([model], options);
  assert.match(
    output,
    /INPUT\s+OUTPUT\s+CONTEXT\s+MAX OUT\s+TOOLS\s+REASON\s+VISION/,
  );
  const row = output.split("\n").find((line) => line.includes(model.name));
  assert.match(row, /\$0\.15\s+\$0\.6\s+128k\s+16\.4k\s+✓\s+·\s+\?/);
  assert.match(output, /USD \/ 1M tokens/);
  assert.match(output, /✓ supported\s+· unsupported\s+\? unknown/);
});

test("terminal colors can be disabled without changing visible output", () => {
  const plain = renderTable([model], options);
  const color = renderTable([model], { ...options, color: true });
  assert.doesNotMatch(plain, /\u001b/);
  assert.match(color, /\u001b\[38;2;214;137;255m/);
  assert.equal(stripVTControlCharacters(color), plain);
});

test("adaptive layouts fit their width with long lab and model names", () => {
  const longModel = {
    ...model,
    name: "A very long model display name ".repeat(8),
    lab: "A very long laboratory name ".repeat(8),
  };
  for (const width of [10, 20, 40, 57, 58, 63, 64, 80, 95, 96, 119, 120, 150]) {
    for (const color of [false, true]) {
      const output = renderTable([longModel], { ...options, width, color });
      const lines = stripVTControlCharacters(output).split("\n");
      assert.ok(
        lines.every((line) => [...line].length <= width),
        `width ${width}`,
      );
    }
  }
});

test("narrow output keeps model prices and context in a readable stack", () => {
  const output = renderTable([model], { ...options, width: 40 });
  assert.match(
    output,
    /Example Model\nExample Lab\nInput\s+\$0\.15\nOutput\s+\$0\.6\nContext\s+128k/,
  );
  assert.doesNotMatch(output, /MAX OUT|TOOLS/);
});

test("medium output drops optional columns without dropping the core table", () => {
  const output = renderTable([model], { ...options, width: 80 });
  assert.match(output, /LAB\s+MODEL\s+INPUT\s+OUTPUT\s+CONTEXT/);
  assert.doesNotMatch(output, /MAX OUT|TOOLS|REASON|VISION/);
  const wider = renderTable([model], { ...options, width: 96 });
  assert.match(wider, /MAX OUT/);
  assert.doesNotMatch(wider, /TOOLS/);
});

test("empty results show recovery instructions and a truthful count", () => {
  const output = renderTable([], { ...options, total: 0 });
  assert.match(output, /No models match these filters\./);
  assert.match(output, /--lab google, or --all/);
  assert.match(output, /\n0 models\n/);
  assert.doesNotMatch(output, /MAX OUT|✓ supported/);
});

test("limited results identify the count and the command to show more", () => {
  const output = renderTable([model], { ...options, total: 42, limited: true });
  assert.match(output, /1 of 42 models · use --all or raise --limit/);
});

test("fresh and cached output identify fetch time separately from build date", () => {
  const fresh = renderTable([model], options);
  assert.match(fresh, /Fetched 2026-11-19 16:23 UTC/);
  assert.match(fresh, /Catalog built 2026-11-19/);
  assert.doesNotMatch(fresh, /Cached|Offline/);
  const cached = renderTable([model], { ...options, cached: true });
  assert.match(cached, /Cached 2026-11-19 16:23 UTC/);
  assert.doesNotMatch(cached, /Fetched|Offline/);
  const stale = renderTable([model], { ...options, cached: true, stale: true });
  assert.match(stale, /Offline · showing saved catalog/);
  assert.match(stale, /Cached 2026-11-19 16:23 UTC/);
});

test("missing freshness metadata never invents a build date", () => {
  const output = renderTable([model], {
    ...options,
    fetchedAt: "invalid",
    buildDate: null,
  });
  assert.match(output, /Fetched unknown/);
  assert.doesNotMatch(output, /Catalog built/);
});

test("zero and very small prices remain distinct from unknown prices", () => {
  assert.equal(formatPrice(0), "$0");
  assert.equal(formatPrice(0.0001), "$1.0e-4");
  assert.equal(formatPrice(0.001), "$0.001");
  assert.equal(formatPrice(0.15), "$0.15");
  assert.equal(formatPrice(12.5), "$12.5");
  for (const value of [null, undefined, NaN, Infinity, -1])
    assert.equal(formatPrice(value), "?");
});

test("token counts use compact values and distinguish missing limits", () => {
  assert.equal(formatTokens(128_000), "128k");
  assert.equal(formatTokens(1_000_000), "1M");
  assert.equal(formatTokens(1_048_576), "1.05M");
  assert.equal(formatTokens(512), "512");
  for (const value of [null, undefined, NaN, Infinity, 0, -1])
    assert.equal(formatTokens(value), "?");
});

test("upstream control characters cannot inject terminal commands", () => {
  const output = renderTable(
    [{ ...model, name: "Example\u001b[31m\nModel" }],
    options,
  );
  assert.doesNotMatch(output, /\u001b/);
  assert.equal(
    output.split("\n").filter((line) => line.includes("Example[31mModel"))
      .length,
    1,
  );
});
