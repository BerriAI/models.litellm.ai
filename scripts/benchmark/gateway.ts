import { number, object, type Model, type Obj } from "./data";
/** Accept a catalog model key, never a gateway alias, URL, ARN or deployment path. */
export function catalogLabel(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 100) return undefined;
  return /^(?:(?:openai|anthropic|gemini|vertex_ai|groq|mistral|deepseek|moonshot|xai)\/)?(?:gpt-[a-z0-9.-]+|o[134](?:-[a-z0-9.-]+)?|claude-[a-z0-9.-]+|gemini-[a-z0-9.-]+|deepseek-[a-z0-9.-]+|mistral-[a-z0-9.-]+|kimi-[a-z0-9.-]+|grok-[a-z0-9.-]+)$/i.test(
    value,
  )
    ? value
    : undefined;
}
export class GatewayError extends Error {
  constructor(
    public status: number,
    public operation: string,
  ) {
    super(
      status === 401
        ? "The gateway rejected this key. Check the selected credential."
        : status === 403
          ? "This key does not have permission for this operation. Use an authorized key or a local log export."
          : status === 404
            ? "This gateway version does not expose the required endpoint. Use a local log export."
            : status === 429
              ? "The gateway rate limit was reached. Wait and start a smaller run."
              : `${operation} failed (${status || "connection or timeout"}). No response body was logged.`,
    );
  }
}
export class Gateway {
  base: string;
  constructor(
    base: string,
    private key: string,
    private signal?: AbortSignal,
  ) {
    const url = new URL(base);
    if (url.username || url.password || url.search || url.hash)
      throw new Error(
        "Use a base URL without credentials, query parameters, or fragments.",
      );
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )
    )
      throw new Error(
        "Use HTTPS for the gateway (HTTP is supported only on loopback).",
      );
    this.base = url.href.replace(/\/$/, "").replace(/\/v1$/, "");
  }
  async request(path: string, body?: Obj) {
    let response: Response;
    try {
      response = await fetch(this.base + path, {
        method: body ? "POST" : "GET",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: (
          AbortSignal as typeof AbortSignal & {
            any(signals: AbortSignal[]): AbortSignal;
          }
        ).any([
          AbortSignal.timeout(body ? 300000 : 60000),
          ...(this.signal ? [this.signal] : []),
        ]),
      });
    } catch {
      throw new GatewayError(0, body ? "Model request" : "Gateway read");
    }
    if (!response.ok)
      throw new GatewayError(
        response.status,
        body ? "Model request" : "Gateway read",
      );
    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new Error("Gateway returned an invalid JSON response.");
    }
    return {
      data,
      cost: number(
        response.headers.has("x-litellm-response-cost")
          ? Number(response.headers.get("x-litellm-response-cost"))
          : undefined,
      ),
    };
  }
  async models(): Promise<Model[]> {
    const { data } = await this.request("/v1/models");
    if (!Array.isArray(data.data))
      throw new Error("Unsupported model-list response.");
    let info: Obj[] = [];
    try {
      const r = await this.request("/model/info");
      info = Array.isArray(r.data.data) ? r.data.data : [];
    } catch (error) {
      if (
        !(error instanceof GatewayError) ||
        ![403, 404].includes(error.status)
      )
        throw error;
    }
    return data.data
      .filter((m: Obj) => typeof m.id === "string")
      .map((m: Obj) => {
        const matches = info.filter((i) => i.model_name === m.id);
        // An alias with multiple prices must not be presented as a known single price.
        const prices = matches.map((i) => object(i.model_info));
        const same = (k: string) =>
          prices.length && prices.every((p) => p[k] === prices[0][k])
            ? prices[0][k]
            : undefined;
        return {
          id: m.id,
          label: catalogLabel(same("key")),
          mode: same("mode"),
          input: number(same("input_cost_per_token")),
          output: number(same("output_cost_per_token")),
          context: number(same("max_input_tokens")),
          tools: same("supports_function_calling"),
          structured: same("supports_response_schema"),
        };
      })
      .filter((m: Model) => !m.mode || m.mode === "chat");
  }
  async logs(days: number, progress: (count: number) => void) {
    const end = new Date();
    const date = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
    const params = new URLSearchParams({
      start_date: date(new Date(end.getTime() - days * 86400000)),
      end_date: date(end),
      page_size: "1000",
      group_by_session: "false",
      sort_by: "startTime",
      sort_order: "asc",
    });
    const rows: Obj[] = [];
    const seen = new Set<string>();
    let complete = true;
    for (let page = 1; ; page++) {
      params.set("page", String(page));
      const { data } = await this.request("/spend/logs/ui?" + params);
      if (!Array.isArray(data.data))
        throw new Error(
          "Unsupported log-list response. Use a local JSON export.",
        );
      const fresh = data.data.filter(
        (row: Obj) =>
          typeof row.request_id === "string" && !seen.has(row.request_id),
      );
      if (data.data.length && !fresh.length) {
        complete = false;
        break;
      }
      for (const row of fresh) seen.add(row.request_id);
      rows.push(...fresh);
      progress(rows.length);
      if (data.total_is_capped) complete = false;
      if (
        !data.data.length ||
        page >= data.total_pages ||
        data.data.length < 1000
      )
        break;
    }
    return { rows, complete };
  }
  async payload(id: string) {
    return (await this.request("/spend/logs/ui/" + encodeURIComponent(id)))
      .data;
  }
}
export class BudgetStop extends Error {}
export class Meter {
  spent = 0;
  estimated = false;
  uncertain = false;
  calls = 0;
  constructor(public limit: number) {}
  async call(gateway: Gateway, model: Model, body: Obj) {
    if (this.uncertain || this.spent >= this.limit)
      throw new BudgetStop(
        "Spending target reached or a prior call could not be costed.",
      );
    this.calls++;
    const start = Date.now();
    let result;
    try {
      result = await gateway.request("/v1/chat/completions", {
        ...body,
        model: model.id,
        stream: false,
        metadata: {
          models_benchmark: true,
          tags: ["models-litellm-benchmark"],
        },
        cache: { "no-cache": true },
      });
    } catch (error) {
      this.uncertain = true;
      throw error;
    } // Never retry potentially billed calls.
    const usage = object(result.data.usage);
    const fallback =
      model.input !== undefined &&
      model.output !== undefined &&
      number(usage.prompt_tokens) !== undefined &&
      number(usage.completion_tokens) !== undefined
        ? usage.prompt_tokens * model.input +
          usage.completion_tokens * model.output
        : undefined;
    const cost = result.cost ?? fallback;
    if (result.cost === undefined) this.estimated = true;
    if (cost === undefined) this.uncertain = true;
    else this.spent += cost;
    return {
      response: object(result.data),
      cost: cost ?? null,
      seconds: (Date.now() - start) / 1000,
    };
  }
}
