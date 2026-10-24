/** Synthetic, in-process demo only. No gateway or paid model calls. */
import { Gateway } from "./gateway";
import type { Obj } from "./data";
export const fixtureRows = Array.from({ length: 30 }, (_, i) => ({
  request_id: `example-${i}`,
  session_id: `session-${i}`,
  model: "example-current",
  call_type: "acompletion",
  prompt_tokens: 100,
  completion_tokens: 20,
  spend: 0.01,
  startTime: "2026-01-01T00:00:00Z",
  endTime: "2026-01-01T00:00:02Z",
  proxy_server_request: {
    body: {
      model: "example-current",
      messages: [
        {
          role: "system",
          content:
            "Extract the invoice total as a JSON object with a numeric total field.",
        },
        { role: "user", content: `Invoice total: ${i + 1} USD.` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "invoice",
          schema: {
            type: "object",
            properties: { total: { type: "number" } },
            required: ["total"],
            additionalProperties: false,
          },
        },
      },
    },
  },
  response: {
    choices: [
      {
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: JSON.stringify({ total: i + 1 }),
        },
      },
    ],
  },
}));
export class FixtureGateway extends Gateway {
  constructor() {
    super("http://localhost", "example-not-a-real-key");
  }
  override async request(
    _path: string,
    body?: Obj,
  ): Promise<{ data: Obj; cost: number | undefined }> {
    const system = body?.messages?.[0]?.content || "";
    const input = body?.messages?.[1]?.content || "";
    let content: string;
    if (system.includes("Select applicable quality criteria"))
      content = JSON.stringify({
        criteria: ["instructions", "groundedness", "completeness"],
      });
    else if (system.includes("Assess each criterion"))
      content = JSON.stringify({
        verdict: input.includes("I ignored the request") ? "fail" : "pass",
      });
    else
      content = JSON.stringify({
        total: Number(input.match(/Invoice total: (\d+)/)?.[1] || 0),
      });
    return {
      data: {
        choices: [
          { finish_reason: "stop", message: { role: "assistant", content } },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      },
      cost: 0.001,
    };
  }
}
