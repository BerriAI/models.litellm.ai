import { expect, it } from "vitest";
import { validateSchema, MAX_DATA_BYTES, SCHEMA_TIMEOUT_MS } from "./schema";
import { deterministic } from "./evaluate";
import { reconstruct, traffic } from "./data";
import { fixtureRows } from "./fixture";

it("validates ordinary schemas and preserves failures", async () => {
  const schema = {
    type: "object",
    required: ["total"],
    properties: { total: { type: "number" } },
  };
  expect(await validateSchema(schema, '{"total":3}')).toBe("pass");
  expect(await validateSchema(schema, '{"total":"wrong"}')).toBe("fail");
  expect(await validateSchema(schema, "invalid json")).toBe("unknown");
});

it("rejects async schemas without treating a promise as a pass", async () => {
  expect(
    await validateSchema({ $async: true, type: "number" }, '"wrong"'),
  ).toBe("unknown");
  expect(
    await validateSchema({ definitions: { nested: { $async: true } } }, "{}"),
  ).toBe("unknown");
});

it("rejects oversized, excessively deep and cyclic schemas before transfer", async () => {
  expect(
    await validateSchema({ description: "x".repeat(128 * 1024) }, "{}"),
  ).toBe("unknown");
  let deep: any = { type: "number" };
  for (let i = 0; i < 40; i++) deep = { properties: { next: deep } };
  expect(await validateSchema(deep, "{}")).toBe("unknown");
  const cyclic: any = {};
  cyclic.self = cyclic;
  expect(await validateSchema(cyclic, "{}")).toBe("unknown");
  expect(await validateSchema({}, '"' + "x".repeat(MAX_DATA_BYTES) + '"')).toBe(
    "unknown",
  );
});

it("terminates pathological regex validation while the parent stays responsive", async () => {
  let ticks = 0;
  const heartbeat = setInterval(() => ticks++, 20);
  const started = Date.now();
  try {
    expect(
      await validateSchema(
        { type: "string", pattern: "^(a+)+$" },
        JSON.stringify("a".repeat(80) + "!"),
      ),
    ).toBe("unknown");
    expect(ticks).toBeGreaterThan(5);
    expect(Date.now() - started).toBeLessThan(SCHEMA_TIMEOUT_MS + 3000);
    // A failed worker neither poisons nor blocks the next validation.
    expect(await validateSchema({ type: "number" }, "3")).toBe("pass");
  } finally {
    clearInterval(heartbeat);
  }
}, 10000);

it("returns unknown for recursive validation crashes and unavailable remote references", async () => {
  expect(await validateSchema({ $ref: "#" }, "{}")).toBe("unknown");
  expect(
    await validateSchema({ $ref: "https://example.com/schema.json" }, "{}"),
  ).toBe("unknown");
});

it("applies isolation to both logged output schemas and tool parameters", async () => {
  const e = reconstruct(traffic(fixtureRows)[0], fixtureRows[0]).example!;
  e.body.response_format.json_schema.schema = { $async: true, type: "object" };
  expect(
    await deterministic(e, {
      choices: [{ finish_reason: "stop", message: { content: "{}" } }],
    }),
  ).toBe("unknown");
  e.body = {
    tools: [
      {
        type: "function",
        function: {
          name: "lookup",
          parameters: { $async: true, type: "object" },
        },
      },
    ],
  };
  expect(
    await deterministic(e, {
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            tool_calls: [{ function: { name: "lookup", arguments: "{}" } }],
          },
        },
      ],
    }),
  ).toBe("unknown");
});
