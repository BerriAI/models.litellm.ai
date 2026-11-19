import { Worker } from "node:worker_threads";
import type { Snapshot } from "./catalog.js";

export type QueryResult = {
  rows?: Record<string, unknown>[];
  tables?: string[];
  error?: string;
  has_more?: boolean;
  next_offset?: number | null;
};
export async function querySession(snapshot: Snapshot, signal: AbortSignal) {
  const worker = new Worker(new URL("./query-worker.js", import.meta.url), {
    workerData: snapshot.tables,
    resourceLimits: { maxOldGenerationSizeMb: 128 },
  });
  const stop = () => {
    void worker.terminate();
  };
  signal.addEventListener("abort", stop, { once: true });
  let closed = false;
  const close = () => {
    closed = true;
    signal.removeEventListener("abort", stop);
    stop();
  };
  const receive = (timeout: number) =>
    new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        close();
        reject(new Error("Catalog query timed out"));
      }, timeout);
      const cleanup = () => {
        clearTimeout(timer);
        worker.off("message", done);
        worker.off("error", fail);
        worker.off("exit", fail);
      };
      const done = (value: unknown) => {
        cleanup();
        resolve(value);
      };
      const fail = () => {
        cleanup();
        close();
        reject(new Error("Catalog query stopped"));
      };
      worker.once("message", done);
      worker.once("error", fail);
      worker.once("exit", fail);
    });
  try {
    signal.throwIfAborted();
    await receive(15_000);
  } catch (error) {
    close();
    throw error;
  }
  return {
    close,
    async query(sql: string, offset = 0): Promise<QueryResult> {
      if (closed) throw new Error("Catalog query stopped");
      if (!Number.isSafeInteger(offset) || offset < 0)
        return { error: "offset must be a nonnegative integer" };
      const result = receive(2_000);
      worker.postMessage({ sql, offset });
      return result;
    },
  };
}
