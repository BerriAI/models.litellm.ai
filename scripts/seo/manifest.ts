export type ManifestModel = {
  pageKey: string;
  name: string;
  lab: string | null;
  price: string | null;
  context?: number;
  providers: string[];
  hash: string;
  firstSeen: string | null;
  lastChanged: string;
  history: { date: string; price: string }[];
  retiredOn?: string;
};

export type Manifest = {
  version: 1;
  buildDate: string;
  costMapHash: string;
  models: Record<string, ManifestModel>;
  /** Comparison pages and when each was first published; caps how many new ones each week releases. */
  compare?: Record<string, { firstSeen: string; kind: string }>;
};

const isJson = (res: Response) => res.headers.get("content-type")?.includes("application/json") ?? false;

export async function loadPreviousManifest(url: string, fetchFn: typeof fetch = fetch): Promise<Manifest | null> {
  if (url === "none") return null;
  const res = await fetchFn(url, { signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`previous manifest ${url} responded ${res.status}`);
  if (!isJson(res)) return null;
  const data = JSON.parse(await res.text());
  return data?.version === 1 && data.models ? (data as Manifest) : null;
}
