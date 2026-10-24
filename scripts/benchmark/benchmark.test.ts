import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { traffic, sampleSessions, reconstruct, compatible } from "./data";
import { deterministic } from "./evaluate";
import { Gateway, GatewayError, Meter } from "./gateway";
import { fixtureRows, FixtureGateway } from "./fixture";
import { run } from "./run";
import { eta } from "./progress";
import { renderReport, safeJSON } from "./report";
const candidates = [
  { id: "example-candidate", input: 0.000001, output: 0.000002 },
];
const judge = { id: "example-judge", input: 0.000001, output: 0.000002 };
const options = {
  rows: fixtureRows,
  days: 7,
  sessions: 30,
  seed: 42,
  candidates,
  judge,
  budget: 5,
  inventoryComplete: true,
  imported: true,
};
const response = (content: string) => ({
  choices: [{ finish_reason: "stop", message: { role: "assistant", content } }],
});
const example = () =>
  reconstruct(traffic(fixtureRows)[0], fixtureRows[0]).example!;
describe("traffic and reconstruction", () => {
  it("excludes benchmark traffic and deduplicates records", () => {
    expect(
      traffic([
        fixtureRows[0],
        fixtureRows[0],
        { ...fixtureRows[1], metadata: { models_benchmark: true } },
        { ...fixtureRows[2], request_tags: ["models-litellm-benchmark"] },
      ]),
    ).toHaveLength(1);
  });
  it("samples deterministically by session with inverse inclusion weights", () => {
    const rows = traffic(
      fixtureRows.flatMap((r) => [
        r,
        { ...r, request_id: r.request_id + "-turn" },
      ]),
    );
    const sample = sampleSessions(rows, 6, 12);
    expect(sample.rows).toHaveLength(12);
    expect(new Set(sample.rows.map((r) => r.session)).size).toBe(6);
    expect(
      sample.rows.reduce((n, r) => n + sample.weights.get(r.session)!, 0),
    ).toBe(60);
    expect(sample.rows.map((r) => r.id)).toEqual(
      sampleSessions(rows, 6, 12).rows.map((r) => r.id),
    );
    expect(sample.rows.map((r) => r.id)).not.toEqual(
      sampleSessions(rows, 6, 14).rows.map((r) => r.id),
    );
  });
  it("does not combine reused session IDs across keys", () => {
    const rows = traffic([
      { ...fixtureRows[0], api_key: "example-a" },
      {
        ...fixtureRows[1],
        session_id: fixtureRows[0].session_id,
        api_key: "example-b",
      },
    ]);
    expect(rows[0].session).not.toBe(rows[1].session);
  });
  it("requires a full request body and rejects truncation and unsupported modalities", () => {
    const row = traffic(fixtureRows)[0];
    expect(
      reconstruct(row, { messages: [{ role: "user", content: "hello" }] })
        .reason,
    ).toBe("Missing request body");
    const truncated = structuredClone(fixtureRows[0]);
    truncated.proxy_server_request.body.messages[1].content =
      "litellm_truncated";
    expect(reconstruct(row, truncated).reason).toContain("Truncated");
    const multimodal = structuredClone(fixtureRows[0]) as any;
    multimodal.proxy_server_request.body.messages[1].content = [
      {
        type: "image_url",
        image_url: { url: "https://example.com/image.png" },
      },
    ];
    expect(reconstruct(row, multimodal).reason).toContain("Multimodal");
  });
  it("strips transport credentials and preserves explicit generation settings without adding caps", () => {
    const raw = structuredClone(fixtureRows[0]) as any;
    Object.assign(raw.proxy_server_request.body, {
      api_key: "example-not-a-real-key",
      api_base: "https://example.com",
      extra_headers: { Authorization: "example" },
      temperature: 0.2,
    });
    const body = reconstruct(traffic([raw])[0], raw).example!.body;
    expect(body).not.toHaveProperty("api_key");
    expect(body).not.toHaveProperty("api_base");
    expect(body).not.toHaveProperty("extra_headers");
    expect(body.temperature).toBe(0.2);
    expect(body).not.toHaveProperty("max_tokens");
    raw.proxy_server_request.body.unsupported_setting = true;
    expect(reconstruct(traffic([raw])[0], raw).reason).toBe(
      "Unsupported request settings",
    );
  });
  it("filters known incompatible models", () => {
    const e = example();
    expect(compatible({ id: "tiny", context: 10 }, e)).toBe(false);
    expect(compatible({ id: "no-json", structured: false }, e)).toBe(false);
  });
});
describe("evaluation and spending", { timeout: 15000 }, () => {
  it("preserves exact gateway model IDs so report recommendations are actionable", async () => {
    const selectedName = "example-team/deployment-v2";
    const result = await run(new FixtureGateway(), {
      ...options,
      candidates: [{ ...candidates[0], id: selectedName }],
      judge: { ...judge, id: "example-team/judge-v1" },
    });
    expect(result.judge).toBe("example-team/judge-v1");
    expect(result.workloads[0].rows.map((r) => r.name)).toEqual([
      "Current · example-current",
      selectedName,
    ]);
    const { allocation } = await import("../../src/benchmark/allocation");
    expect(allocation(result, 95).choices[0].model).toBe(selectedName);
  });
  it("checks output schemas, finish reasons and tool arguments independently of judging", async () => {
    const e = example();
    expect(await deterministic(e, response('{"total":3}'))).toBe("pass");
    expect(await deterministic(e, response("not json"))).toBe("fail");
    expect(await deterministic(e, response('{"total":"wrong"}'))).toBe("fail");
    expect(
      await deterministic(e, {
        choices: [{ finish_reason: "length", message: { content: "{}" } }],
      }),
    ).toBe("fail");
    e.body = {
      messages: [],
      tool_choice: "required",
      tools: [
        {
          type: "function",
          function: {
            name: "lookup",
            parameters: {
              type: "object",
              required: ["id"],
              properties: { id: { type: "number" } },
            },
          },
        },
      ],
    };
    expect(await deterministic(e, response("Done"))).toBe("fail");
    expect(
      await deterministic(e, {
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              tool_calls: [
                { function: { name: "lookup", arguments: '{"id":2}' } },
              ],
            },
          },
        ],
      }),
    ).toBe("pass");
  });
  it("keeps development sessions out of scored requests and produces aggregate-only output", async () => {
    const g = new FixtureGateway();
    const requests: any[] = [];
    const original = g.request.bind(g);
    g.request = async (path, body) => {
      requests.push(body);
      return original(path, body);
    };
    const result = await run(g, options);
    expect(result.status).toBe("complete");
    expect(result.development).toBe(6);
    expect(result.heldout).toBe(24);
    expect(result.workloads[0].rows[1].quality).toBe(100);
    expect(result.evaluationSpend).toBeCloseTo(0.074);
    const devRequest = JSON.parse(
      requests.find((b) => b.messages[0].content.includes("Select applicable"))
        .messages[1].content,
    ).request;
    const generation = requests.filter((b) => b.model === "example-candidate");
    expect(generation).toHaveLength(24);
    expect(
      generation.some(
        (b) =>
          JSON.stringify(b.messages) === JSON.stringify(devRequest.messages),
      ),
    ).toBe(false);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Invoice total:");
    expect(serialized).toContain("example-current");
    expect(serialized).not.toContain("example-0");
    expect(serialized).not.toContain("proxy_server_request");
  });
  it("writes readiness results without inference when logs have no contents", async () => {
    const result = await run(new FixtureGateway(), {
      ...options,
      rows: fixtureRows.map((r) => ({
        ...r,
        proxy_server_request: {},
        response: {},
      })),
    });
    expect(result.status).toBe("readiness");
    expect(result.evaluationSpend).toBe(0);
    expect(result.exclusions["Missing request body"]).toBe(30);
  });
  it("stops on the spending target and never reports pending jobs as successful", async () => {
    const result = await run(new FixtureGateway(), {
      ...options,
      budget: 0.004,
    });
    expect(result.status).toBe("partial");
    expect(result.evaluationSpend).toBeCloseTo(0.004);
    expect(result.workloads[0].rows[1].quality).toBeNull();
    expect(result.workloads[0].rows[1].cost).toBeNull();
  });
  it("stops after an uncosted call instead of treating it as free", async () => {
    const g = new FixtureGateway();
    g.request = async () => ({ data: response("ok"), cost: undefined as any });
    const meter = new Meter(1);
    await meter.call(g, { id: "unknown" }, { messages: [] });
    expect(meter.uncertain).toBe(true);
    await expect(
      meter.call(g, { id: "unknown" }, { messages: [] }),
    ).rejects.toThrow("could not be costed");
    expect(meter.calls).toBe(1);
  });
  it("supports cancellation without starting model requests", async () => {
    const c = new AbortController();
    c.abort();
    const result = await run(new FixtureGateway(), {
      ...options,
      signal: c.signal,
    });
    expect(result.evaluationSpend).toBe(0);
  });
});
describe("gateway contract", () => {
  it("normalizes /v1 and rejects credential-bearing or insecure remote URLs", () => {
    expect(new Gateway("https://example.com/proxy/v1/", "example").base).toBe(
      "https://example.com/proxy",
    );
    expect(() => new Gateway("http://example.com", "example")).toThrow("HTTPS");
    expect(
      () => new Gateway("https://example.com/?key=example", "example"),
    ).toThrow("without credentials");
  });
  it("reads model and log APIs with authorization and surfaces safe errors", async () => {
    const server = createServer((req, res) => {
      expect(req.headers.authorization).toBe("Bearer example-not-a-real-key");
      res.setHeader("Content-Type", "application/json");
      const path = req.url!.split("?")[0];
      if (path === "/v1/models")
        res.end(JSON.stringify({ data: [{ id: "example-model" }] }));
      else if (path === "/model/info")
        res.end(
          JSON.stringify({
            data: [
              {
                model_name: "example-model",
                model_info: {
                  input_cost_per_token: 0.001,
                  output_cost_per_token: 0.002,
                  max_input_tokens: 4000,
                },
              },
            ],
          }),
        );
      else if (path === "/spend/logs/ui")
        res.end(
          JSON.stringify({
            data: fixtureRows,
            total_pages: 1,
            total_is_capped: true,
          }),
        );
      else if (path === "/spend/logs/ui/example-0")
        res.end(JSON.stringify(fixtureRows[0]));
      else {
        res.statusCode = 403;
        res.end(
          JSON.stringify({
            error: "sensitive example diagnostic that must not be printed",
          }),
        );
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    try {
      const address = server.address() as { port: number };
      const g = new Gateway(
        `http://127.0.0.1:${address.port}/v1`,
        "example-not-a-real-key",
      );
      expect((await g.models())[0].input).toBe(0.001);
      const logs = await g.logs(7, () => {});
      expect(logs.rows).toHaveLength(30);
      expect(logs.complete).toBe(false);
      expect((await g.payload("example-0")).request_id).toBe("example-0");
      await expect(g.payload("missing")).rejects.toBeInstanceOf(GatewayError);
      await expect(g.payload("missing")).rejects.not.toThrow("sensitive");
    } finally {
      await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    }
  });
});
describe("local report and TUI", () => {
  it("only estimates remaining time after measured progress", () => {
    expect(eta(500, 1, 20)).toBe("estimating ETA");
    expect(eta(2000, 2, 10)).toBe("~8s remaining");
    expect(eta(5000, 20, null)).toBe("estimating ETA");
  });
  it("escapes embedded JSON", () => {
    expect(
      safeJSON({ text: "</script><script>alert(1)</script>" }),
    ).not.toContain("<");
  });
  it("bundles the actual Svelte view, fonts and images into offline HTML", async () => {
    const report = await run(new FixtureGateway(), options);
    const untrustedName = '</script><img data-model-injection="true" src=x>';
    report.judge = untrustedName;
    const html = await renderReport(report);
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("script-src 'sha256-");
    expect(html).toContain("data:font/woff2");
    expect(html).not.toMatch(/<script[^>]*\bsrc=/);
    expect(html).not.toMatch(/<link[^>]*\bhref=/);
    expect(html).not.toContain("Invoice total:");
    expect(html).toContain("Current · example-current");
    expect(html).toContain("example-candidate");
    expect(html).not.toContain(untrustedName);
    const data = html.match(
      /<script id="benchmark-data" type="application\/json">([\s\S]*?)<\/script>/,
    )![1];
    expect(JSON.parse(data).report.judge).toBe(untrustedName);
  }, 20000);
});

describe("allocation boundaries", { timeout: 15000 }, () => {
  it("selects a whole workload and excludes tool turns and partial runs", async () => {
    const { allocation } = await import("../../src/benchmark/allocation");
    const report = await run(new FixtureGateway(), options);
    expect(allocation(report, 95).share).toBe(100);
    report.workloads[0].agentTurns = true;
    expect(allocation(report, 95).share).toBe(0);
    report.workloads[0].agentTurns = false;
    report.status = "partial";
    expect(allocation(report, 95).share).toBe(0);
  });
  it("does not equate missing quality or cost with eligibility", async () => {
    const { allocation } = await import("../../src/benchmark/allocation");
    const report = await run(new FixtureGateway(), options);
    report.workloads[0].rows[1].quality = null;
    expect(allocation(report, 95).share).toBe(0);
    report.workloads[0].rows[1].quality = 100;
    report.workloads[0].rows[1].cost = null;
    expect(allocation(report, 95).share).toBe(0);
  });
  it("estimates planned generation and judging separately from token limits", async () => {
    const { estimateCost } = await import("./planning");
    expect(
      estimateCost(traffic(fixtureRows), candidates, judge),
    ).toBeGreaterThan(0);
    expect(
      estimateCost(traffic(fixtureRows), [{ id: "unknown" }], judge),
    ).toBeNull();
  });
});
