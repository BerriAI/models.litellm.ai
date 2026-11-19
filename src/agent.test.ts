import { describe, expect, it } from "vitest";
import { buildSnapshot } from "../server/catalog.js";
import { querySession } from "../server/query.js";
import { runAgent, gatewayConfig } from "../server/agent.js";

const snapshot = buildSnapshot(
  {
    sample_spec: { newly_added_capability: "A new capability added upstream" },
    "seller/alpha": {
      mode: "chat",
      max_input_tokens: 1_048_576,
      input_cost_per_token: 0.000001,
      input_cost_per_token_above_200k_tokens: 0.000003,
      output_cost_per_token: 0.000002,
      supports_vision: true,
      newly_added_capability: true,
    },
    "seller/beta": {
      mode: "chat",
      max_input_tokens: 1_048_576,
      input_cost_per_token: 0.000002,
      output_cost_per_token: 0.000002,
    },
    "seller/free": {
      mode: "chat",
      max_input_tokens: 1000,
      input_cost_per_token: 0,
    },
    "seller/unknown": { mode: "chat", max_input_tokens: 1_048_576 },
  },
  { providers: { seller: { endpoints: { chat_completions: true } } } },
  {
    models: {
      alpha: {
        name: "Alpha",
        modelId: "seller/alpha",
        firstSeen: "2026-11-01",
      },
    },
    deprecations: [
      {
        modelId: "removed/legacy",
        slug: "legacy",
        date: "2026-12-01",
        successor: "alpha",
        reference: "https://example.com/notice",
      },
    ],
  },
  {
    updates: [
      {
        id: "change",
        date: "2026-11-01",
        kind: "price",
        entries: [
          {
            modelId: "seller/alpha",
            changes: [{ field: "input_cost_per_token", before: 2, after: 1 }],
          },
        ],
      },
    ],
  },
  {},
);

describe("read-only catalog queries", () => {
  it("preserves unknowns, zero prices, tiered prices, joins, JSON and evolving fields", async () => {
    const db = await querySession(snapshot, new AbortController().signal);
    try {
      const result = await db.query(
        "SELECT id, coalesce(input_cost_per_token_above_200k_tokens, input_cost_per_token) * 1000000 AS cost FROM models WHERE max_input_tokens >= 1000000 AND input_cost_per_token IS NOT NULL ORDER BY cost",
      );
      expect(result.rows).toEqual([
        { id: "seller/beta", cost: 2 },
        { id: "seller/alpha", cost: 3 },
      ]);
      expect(result.tables).toEqual(["models"]);
      expect(
        (
          await db.query(
            "SELECT COUNT(*) AS n FROM models WHERE input_cost_per_token IS NULL",
          )
        ).rows,
      ).toEqual([{ n: 1 }]);
      expect(
        (await db.query("SELECT id FROM models WHERE input_cost_per_token = 0"))
          .rows,
      ).toEqual([{ id: "seller/free" }]);
      expect(
        (
          await db.query(
            "SELECT json_extract(endpoints, '$.chat_completions') AS supported FROM providers",
          )
        ).rows,
      ).toEqual([{ supported: 1 }]);
      expect(
        (
          await db.query(
            "SELECT c.name, m.newly_added_capability FROM catalog c JOIN models m ON m.id = c.modelId",
          )
        ).rows,
      ).toEqual([{ name: "Alpha", newly_added_capability: 1 }]);
      expect(
        (await db.query("SELECT modelId, successor FROM deprecations")).rows,
      ).toEqual([{ modelId: "removed/legacy", successor: "alpha" }]);
      expect(snapshot.schema).toContain(
        "newly_added_capability: INTEGER (0/1) — A new capability added upstream",
      );
    } finally {
      db.close();
    }
  });
  it("paginates after SQL evaluation without hiding further rows", async () => {
    const db = await querySession(snapshot, new AbortController().signal);
    try {
      const sql =
        "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<105) SELECT x FROM n ORDER BY x";
      const first = await db.query(sql);
      expect(first.rows).toHaveLength(100);
      expect(first.has_more).toBe(true);
      expect(first.next_offset).toBe(100);
      const next = await db.query(sql, 100);
      expect(next.rows).toHaveLength(5);
      expect(next.has_more).toBe(false);
    } finally {
      db.close();
    }
  });
  it("rejects writes, stacked statements and extension loading; data stays intact", async () => {
    const db = await querySession(snapshot, new AbortController().signal);
    try {
      for (const sql of [
        "DELETE FROM models",
        "WITH n AS (SELECT 1) DELETE FROM models",
        "SELECT 1; DELETE FROM models",
        "ATTACH DATABASE '/tmp/private' AS x",
        "SELECT load_extension('anything')",
      ])
        expect((await db.query(sql)).error).toBeTruthy();
      expect((await db.query("SELECT count(*) AS n FROM models")).rows).toEqual(
        [{ n: 4 }],
      );
    } finally {
      db.close();
    }
  });
  it("terminates expensive SQL without blocking the request process", async () => {
    const db = await querySession(snapshot, new AbortController().signal);
    try {
      await expect(
        db.query(
          "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n) SELECT sum(x) FROM n",
        ),
      ).rejects.toThrow(/timed out/);
    } finally {
      db.close();
    }
  });
});

const sse = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
function modelStream(sql?: string) {
  const delta = sql
    ? {
        tool_calls: [
          {
            index: 0,
            id: "query",
            type: "function",
            function: {
              name: "query_catalog",
              arguments: JSON.stringify({ sql }),
            },
          },
        ],
      }
    : { content: "The answer. [1]" };
  return new Response(
    sse({ choices: [{ delta }] }) +
      sse({
        choices: [{ delta: {}, finish_reason: sql ? "tool_calls" : "stop" }],
      }) +
      "data: [DONE]\n\n",
  );
}

it("stops gateway calls immediately when a query timeout kills the worker", async () => {
  let calls = 0;
  await expect(
    runAgent({
      question: "Count matching listings.",
      history: [],
      snapshot,
      gateway: {
        base: "https://gateway.example.com/v1",
        key: "test-placeholder",
      },
      signal: new AbortController().signal,
      emit: () => {},
      fetchImpl: async () => {
        calls++;
        return modelStream(
          calls === 1
            ? "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n) SELECT sum(x) FROM n"
            : undefined,
        );
      },
    }),
  ).rejects.toThrow(/timed out/);
  expect(calls).toBe(1);
});

it("lets the model correct an ordinary SQL error while the worker remains usable", async () => {
  let calls = 0;
  await runAgent({
    question: "Count matching listings.",
    history: [],
    snapshot,
    gateway: {
      base: "https://gateway.example.com/v1",
      key: "test-placeholder",
    },
    signal: new AbortController().signal,
    emit: () => {},
    fetchImpl: async (_url, init) => {
      calls++;
      if (calls === 2)
        expect(
          JSON.parse(String(init?.body)).messages.at(-1).content,
        ).toContain("no such table");
      return modelStream(
        calls === 1
          ? "SELECT * FROM missing_table"
          : calls === 2
            ? "SELECT count(*) FROM models"
            : undefined,
      );
    },
  });
  expect(calls).toBe(3);
});

it("delivers the live schema to the model, queries evidence and streams a cited answer in the next call", async () => {
  const events: any[] = [],
    inputs: any[] = [];
  await runAgent({
    question: "Which providers support chat?",
    history: [
      { question: "Earlier question", answer: "Unverified prior answer" },
    ],
    snapshot,
    gateway: {
      base: "https://gateway.example.com/v1",
      key: "test-placeholder",
      clientId: "test-client",
      clientSecret: "test-access",
    },
    signal: new AbortController().signal,
    emit: (event) => events.push(event),
    fetchImpl: async (url, init) => {
      const body = JSON.parse(String(init?.body));
      inputs.push(body);
      expect(url).toBe("https://gateway.example.com/v1/chat/completions");
      expect(body).not.toHaveProperty("max_tokens");
      expect(body).not.toHaveProperty("max_completion_tokens");
      expect(JSON.stringify(body)).not.toContain("test-placeholder");
      expect(init?.redirect).toBe("error");
      const delta =
        inputs.length === 1
          ? {
              tool_calls: [
                {
                  index: 0,
                  id: "q1",
                  type: "function",
                  function: {
                    name: "query_catalog",
                    arguments: JSON.stringify({
                      sql: "SELECT id FROM providers WHERE json_extract(endpoints, '$.chat_completions') = 1",
                    }),
                  },
                },
              ],
            }
          : { content: "Seller supports chat completions. [3]" };
      return new Response(
        sse({ choices: [{ delta }] }) +
          sse({
            choices: [
              {
                delta: {},
                finish_reason: inputs.length === 1 ? "tool_calls" : "stop",
              },
            ],
          }) +
          "data: [DONE]\n\n",
      );
    },
  });
  expect(inputs).toHaveLength(2);
  expect(inputs[0].messages[0].content).toContain(snapshot.schema);
  expect(inputs[1].messages.at(-1).content).toContain('"seller"');
  expect(events.at(-1)).toEqual({
    type: "done",
    sources: [snapshot.sources[2]],
  });
});

it("requires runtime gateway credentials and validates transport settings", () => {
  expect(gatewayConfig({})).toBeNull();
  expect(() =>
    gatewayConfig({
      LITELLM_PROXY_API_BASE: "http://gateway.example.com",
      LITELLM_PROXY_API_KEY: "test-placeholder",
    }),
  ).toThrow();
  expect(() =>
    gatewayConfig({
      LITELLM_PROXY_API_BASE: "https://gateway.example.com",
      LITELLM_PROXY_API_KEY: "test-placeholder",
      CF_ACCESS_CLIENT_ID: "test-client",
    }),
  ).toThrow();
});
