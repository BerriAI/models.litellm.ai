/** Build-time GET helpers. A transient failure (network error, timeout, 429, 5xx) is retried with backoff. */
export type FetchTextOptions = {
  timeoutMs?: number;
  attempts?: number;
  backoffMs?: number;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

type Outcome<T> = { body: T } | { status: number } | { error: unknown };

const retryable = (status: number) => status === 429 || status >= 500;
const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export const fetchText = (url: string, options: FetchTextOptions = {}) =>
  fetchBody(url, (res) => res.text(), options);

export const fetchBytes = (url: string, options: FetchTextOptions = {}) =>
  fetchBody(
    url,
    async (res) => new Uint8Array(await res.arrayBuffer()),
    options,
  );

async function fetchBody<T>(
  url: string,
  read: (res: Response) => Promise<T>,
  options: FetchTextOptions,
): Promise<T> {
  const {
    timeoutMs = 30_000,
    attempts = 3,
    backoffMs = 1_000,
    fetchFn = fetch,
    sleep = wait,
  } = options;
  for (let attempt = 1; ; attempt++) {
    const outcome: Outcome<T> = await fetchFn(url, {
      signal: AbortSignal.timeout(timeoutMs),
    })
      .then(
        async (res): Promise<Outcome<T>> =>
          res.ok ? { body: await read(res) } : { status: res.status },
      )
      .catch((error: unknown) => ({ error }));
    if ("body" in outcome) return outcome.body;
    const failure =
      "status" in outcome
        ? new Error(`${url} responded ${outcome.status}`)
        : outcome.error;
    if (
      attempt >= attempts ||
      ("status" in outcome && !retryable(outcome.status))
    )
      throw failure;
    await sleep(backoffMs * 2 ** (attempt - 1));
  }
}
