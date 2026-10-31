import type { DeprecationListing } from "../../src/deprecations";

export type ManifestModel = {
  pageKey: string;
  name: string;
  /** Copyable LiteLLM route; absent in older manifests. */
  modelId?: string | null;
  /** Provider hub of the copyable route, independent of the model developer. */
  modelProviderId?: string | null;
  lab: string | null;
  price: string | null;
  context?: number;
  /** Capability metadata is optional when reading an older published manifest. */
  mode?: string;
  inputModalities?: string[];
  outputModalities?: string[];
  providers: string[];
  /** Stable hub ids for clients; older manifests contain only provider labels. */
  providerIds?: string[];
  status?: "active" | "deprecated" | "retired";
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
  deprecations?: DeprecationListing[];
  /** Comparison pages and when each was first published; caps how many new ones each week releases. */
  compare?: Record<string, { firstSeen: string; kind: string }>;
  /** Ranking pages already published; each keeps its page while any model is left on it. */
  rankings?: string[];
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
