import { Worker } from "node:worker_threads";
import type { Verdict } from "./evaluate";

export const MAX_DATA_BYTES = 1024 * 1024;
const MAX_SCHEMA_BYTES = 128 * 1024;
export const SCHEMA_TIMEOUT_MS = 2000;

/** Bound traversal before serialization/structured cloning of a logged schema. */
function serializeSchema(schema: unknown): string | undefined {
  let nodes = 0;
  let bytes = 0;
  const seen = new Set<object>();
  function visit(value: unknown, depth: number): boolean {
    if (++nodes > 10000 || depth > 32) return false;
    bytes += 8;
    if (typeof value === "string") bytes += Buffer.byteLength(value) * 6;
    else if (value !== null && typeof value === "object") {
      if (seen.has(value)) return false;
      seen.add(value);
      for (const key in value) {
        if (!Object.hasOwn(value, key)) continue;
        bytes += Buffer.byteLength(key) * 6 + 4;
        if (
          bytes > MAX_SCHEMA_BYTES ||
          !visit((value as Record<string, unknown>)[key], depth + 1)
        )
          return false;
        // Async validation must never be mistaken for a successful boolean result.
        if (key === "$async") return false;
      }
    } else if (!["boolean", "number"].includes(typeof value) && value !== null)
      return false;
    return bytes <= MAX_SCHEMA_BYTES;
  }
  if (!visit(schema, 0)) return undefined;
  return JSON.stringify(schema);
}

/** Untrusted schemas never compile or execute on the CLI's event loop. */
export async function validateSchema(
  schema: unknown,
  data: string,
): Promise<Verdict> {
  let serialized: string | undefined;
  try {
    if (Buffer.byteLength(data) > MAX_DATA_BYTES) return "unknown";
    serialized = serializeSchema(schema);
  } catch {
    return "unknown";
  }
  if (serialized === undefined) return "unknown";
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./schema-worker.cjs", import.meta.url), {
        workerData: { schema: serialized, data },
        env: {},
        execArgv: [],
        resourceLimits: {
          maxOldGenerationSizeMb: 32,
          maxYoungGenerationSizeMb: 8,
          stackSizeMb: 2,
        },
        stdout: true,
        stderr: true,
      });
    } catch {
      resolve("unknown");
      return;
    }
    // Never forward validator diagnostics containing customer schemas or data.
    worker.stdout.resume();
    worker.stderr.resume();
    let settled = false;
    const finish = async (verdict: Verdict) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        await worker.terminate();
      } catch {
        /* Already stopped. */
      }
      resolve(verdict);
    };
    const timer = setTimeout(() => void finish("unknown"), SCHEMA_TIMEOUT_MS);
    worker.once(
      "message",
      (value) =>
        void finish(value === "pass" || value === "fail" ? value : "unknown"),
    );
    worker.once("error", () => void finish("unknown"));
    worker.once("exit", () => void finish("unknown"));
  });
}
