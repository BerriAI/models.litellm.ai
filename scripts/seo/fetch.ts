/** Build-time GET helpers. A transient failure (network error, timeout, 429, 5xx) is retried with backoff. */
export type FetchTextOptions = {
  timeoutMs?: number;
  attempts?: number;
  backoffMs?: number;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

type Outcome = { text: string } | { status: number } | { error: unknown };

const retryable = (status: number) => status === 429 || status >= 500;
const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchText(
  url: string,
  options: FetchTextOptions = {},
): Promise<string> {
  const {
    timeoutMs = 30_000,
    attempts = 3,
    backoffMs = 1_000,
    fetchFn = fetch,
    sleep = wait,
  } = options;
  for (let attempt = 1; ; attempt++) {
    const outcome: Outcome = await fetchFn(url, {
      signal: AbortSignal.timeout(timeoutMs),
    })
      .then(
        async (res): Promise<Outcome> =>
          res.ok ? { text: await res.text() } : { status: res.status },
      )
      .catch((error: unknown) => ({ error }));
    if ("text" in outcome) return outcome.text;
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
