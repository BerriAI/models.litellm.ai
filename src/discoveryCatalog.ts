import {
  hubProvider,
  providerName,
  type ProviderSupport,
} from "../scripts/seo/providers";
import { getProviderLogo } from "./providers";

export type DiscoveryProviderReference = {
  id: string;
  name: string;
  logo: string | null;
  href: string;
};

export type DiscoveryModel = {
  slug: string;
  name: string;
  lab: string | null;
  logo: string | null;
  href: string;
  /** First catalog appearance, not the model's launch or LiteLLM release date. */
  firstSeen: string;
  price: string | null;
  context: number | null;
  mode: string | null;
  inputModalities: string[];
  outputModalities: string[];
  providers: DiscoveryProviderReference[];
};

export type DiscoveryProvider = DiscoveryProviderReference & {
  modelCount: number;
  recentModelCount: number;
  /** Latest canonical model addition; this is not a provider integration date. */
  latestModelDate: string | null;
  latestModelName: string | null;
};

export type DiscoveryCatalog = {
  updatedAt: string;
  models: DiscoveryModel[];
  providers: DiscoveryProvider[];
};

type CatalogModel = Omit<DiscoveryModel, "logo" | "firstSeen" | "providers"> & {
  pageKey: string;
  firstSeen: string | null;
  providerNames: string[];
  providerIds: string[];
};

const MANIFEST_URL = "/models/manifest.json";
const PROVIDER_SUPPORT_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/provider_endpoints_support.json";
const SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/;
const SAFE_MODEL_SLUG = /^[a-z0-9][a-z0-9._-]*$/;
const RECENT_DAYS = 30;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function catalogDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}(-\d{2})?$/.test(value)) {
    return null;
  }
  const day = value.length === 7 ? `${value}-01` : value;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === day
    ? value
    : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim() !== "",
      )
    : [];
}

function parseModels(value: unknown, updatedAt: string): CatalogModel[] {
  if (!isRecord(value)) throw new Error("The model catalog is unavailable.");
  const models: CatalogModel[] = [];
  for (const [slug, entry] of Object.entries(value)) {
    if (
      !SAFE_MODEL_SLUG.test(slug) ||
      !isRecord(entry) ||
      typeof entry.pageKey !== "string" ||
      !entry.pageKey ||
      typeof entry.name !== "string" ||
      !entry.name.trim() ||
      entry.retiredOn != null ||
      entry.status === "retired"
    )
      continue;

    const firstSeen = catalogDate(entry.firstSeen);
    models.push({
      slug,
      pageKey: entry.pageKey,
      name: entry.name,
      lab: typeof entry.lab === "string" ? entry.lab : null,
      href: `/models/${slug}`,
      // Future or malformed dates must not turn into new model announcements.
      firstSeen: firstSeen && firstSeen <= updatedAt ? firstSeen : null,
      price: typeof entry.price === "string" ? entry.price : null,
      context:
        typeof entry.context === "number" &&
        Number.isFinite(entry.context) &&
        entry.context > 0
          ? entry.context
          : null,
      mode:
        typeof entry.mode === "string" && entry.mode.trim()
          ? entry.mode.trim().toLowerCase()
          : null,
      inputModalities: modalityList(entry.inputModalities),
      outputModalities: modalityList(entry.outputModalities),
      providerNames: stringList(entry.providers),
      providerIds: stringList(entry.providerIds).filter((id) =>
        SAFE_ID.test(id),
      ),
    });
  }
  return models;
}

function parseSupport(value: unknown): ProviderSupport {
  const support: ProviderSupport = { providers: {} };
  if (!isRecord(value) || !isRecord(value.providers)) return support;
  for (const [id, entry] of Object.entries(value.providers)) {
    if (!SAFE_ID.test(id) || !isRecord(entry)) continue;
    support.providers![id] = {
      display_name:
        typeof entry.display_name === "string" ? entry.display_name : undefined,
    };
  }
  return support;
}

function providerReference(
  id: string,
  support: ProviderSupport,
): DiscoveryProviderReference {
  const hub = hubProvider(id);
  return {
    id: hub,
    name: providerName(hub, support),
    logo: getProviderLogo(hub),
    href: `/providers/${hub}`,
  };
}

function providerReferences(
  models: CatalogModel[],
  support: ProviderSupport,
): Map<string, DiscoveryProviderReference> {
  const references = new Map<string, DiscoveryProviderReference>();
  const ids = new Set([
    ...Object.keys(support.providers ?? {}),
    ...models.flatMap((model) => model.providerIds),
  ]);
  for (const id of ids) {
    const ref = providerReference(id, support);
    references.set(providerName(id, support), ref);
  }
  return references;
}

function canonicalModels(models: CatalogModel[]): CatalogModel[] {
  const canonical = new Map<string, CatalogModel>();
  // Prefer the canonical page key as its URL when an old alias remains in a manifest.
  models.sort(
    (a, b) =>
      Number(b.slug === b.pageKey) - Number(a.slug === a.pageKey) ||
      a.slug.localeCompare(b.slug),
  );
  for (const model of models) {
    const existing = canonical.get(model.pageKey);
    if (!existing) {
      canonical.set(model.pageKey, model);
      continue;
    }
    existing.providerNames = [
      ...new Set([...existing.providerNames, ...model.providerNames]),
    ];
    existing.providerIds = [
      ...new Set([...existing.providerIds, ...model.providerIds]),
    ];
    // Unknown history stays unknown; a later alias cannot make an old model look new.
    existing.firstSeen =
      existing.firstSeen && model.firstSeen
        ? [existing.firstSeen, model.firstSeen].sort()[0]
        : null;
  }
  return [...canonical.values()];
}

function buildCatalog(
  manifest: unknown,
  supportData: unknown,
): DiscoveryCatalog {
  if (!isRecord(manifest) || manifest.version !== 1)
    throw new Error("The model catalog is unavailable.");
  const updatedAt = catalogDate(manifest.buildDate);
  if (!updatedAt || updatedAt.length !== 10)
    throw new Error("The model catalog is unavailable.");
  const entries = canonicalModels(parseModels(manifest.models, updatedAt));
  const support = parseSupport(supportData);
  const references = providerReferences(entries, support);
  const providers = new Map<string, DiscoveryProvider>();
  const models: DiscoveryModel[] = [];
  const recentSince = new Date(`${updatedAt}T00:00:00Z`);
  recentSince.setUTCDate(recentSince.getUTCDate() - RECENT_DAYS);
  const cutoff = recentSince.toISOString().slice(0, 10);

  for (const entry of entries) {
    const refs = new Map<string, DiscoveryProviderReference>();
    if (entry.providerIds.length) {
      for (const id of entry.providerIds) {
        const ref = providerReference(id, support);
        refs.set(ref.id, ref);
      }
    } else {
      for (const name of entry.providerNames) {
        // Older manifests contain labels only. Unknown labels link to the provider browser;
        // guessing a hub slug would create broken links and potentially incorrect logos.
        const ref = references.get(name) ?? {
          id: `label:${name}`,
          name,
          logo: null,
          href: "/providers",
        };
        refs.set(ref.id, ref);
      }
    }
    const modelProviders = [...refs.values()];
    for (const ref of modelProviders) {
      const provider = providers.get(ref.id) ?? {
        ...ref,
        modelCount: 0,
        recentModelCount: 0,
        latestModelDate: null,
        latestModelName: null,
      };
      provider.modelCount += 1;
      if (entry.firstSeen && entry.firstSeen >= cutoff)
        provider.recentModelCount += 1;
      if (
        entry.firstSeen &&
        (!provider.latestModelDate ||
          entry.firstSeen > provider.latestModelDate)
      ) {
        provider.latestModelDate = entry.firstSeen;
        provider.latestModelName = entry.name;
      }
      providers.set(ref.id, provider);
    }
    if (!entry.firstSeen) continue;
    const logo = entry.lab
      ? getProviderLogo(entry.lab.toLowerCase()) ??
        modelProviders.find((provider) => provider.name === entry.lab)?.logo ??
        null
      : modelProviders[0]?.logo ?? null;
    models.push({
      slug: entry.slug,
      name: entry.name,
      lab: entry.lab,
      logo,
      href: entry.href,
      firstSeen: entry.firstSeen,
      price: entry.price,
      context: entry.context,
      mode: entry.mode,
      inputModalities: entry.inputModalities,
      outputModalities: entry.outputModalities,
      providers: modelProviders,
    });
  }
  models.sort(
    (a, b) =>
      b.firstSeen.localeCompare(a.firstSeen) || a.name.localeCompare(b.name),
  );
  return {
    updatedAt,
    models,
    providers: [...providers.values()].sort(
      (a, b) =>
        (b.latestModelDate ?? "").localeCompare(a.latestModelDate ?? "") ||
        b.recentModelCount - a.recentModelCount ||
        a.name.localeCompare(b.name),
    ),
  };
}

async function fetchJson(url: string, fetchFn: typeof fetch): Promise<unknown> {
  const response = await fetchFn(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok)
    throw new Error(`The model catalog responded ${response.status}.`);
  return response.json();
}

export async function loadDiscoveryCatalog(
  fetchFn: typeof fetch = fetch,
): Promise<DiscoveryCatalog> {
  const [manifest, support] = await Promise.all([
    fetchJson(MANIFEST_URL, fetchFn),
    // Model updates remain useful if provider labels are temporarily unavailable.
    fetchJson(PROVIDER_SUPPORT_URL, fetchFn).catch(() => null),
  ]);
  return buildCatalog(manifest, support);
}

/** Keep the newest cards varied when one lab adds several variants together. */
export function selectDiscoveryModels(
  models: DiscoveryModel[],
  limit = 6,
): DiscoveryModel[] {
  const selected = new Set<DiscoveryModel>();
  const labs = new Set<string>();
  for (const model of models) {
    if (selected.size >= limit) break;
    const lab = model.lab ?? model.providers[0]?.id ?? model.slug;
    if (labs.has(lab)) continue;
    selected.add(model);
    labs.add(lab);
  }
  for (const model of models) {
    if (selected.size >= limit) break;
    selected.add(model);
  }
  return models.filter((model) => selected.has(model));
}

function modalityList(value: unknown): string[] {
  return [
    ...new Set(stringList(value).map((item) => item.trim().toLowerCase())),
  ];
}

type ModalityDescription = {
  task: string;
  input?: string[];
  output?: string[];
};

// A mode can describe the task when a catalog row has no modality arrays.
// Only modes that establish an input/output type supply a flow fallback.
const MODE_MODALITIES: Record<string, ModalityDescription> = {
  chat: { task: "Chat" },
  responses: { task: "Generation" },
  completion: { task: "Text completion", input: ["text"], output: ["text"] },
  audio_speech: {
    task: "Speech generation",
    input: ["text"],
    output: ["audio"],
  },
  audio_transcription: {
    task: "Transcription",
    input: ["audio"],
    output: ["text"],
  },
  image_generation: { task: "Image generation", output: ["image"] },
  image_edit: { task: "Image editing", output: ["image"] },
  video_generation: { task: "Video generation", output: ["video"] },
  embedding: { task: "Embeddings", output: ["embeddings"] },
  rerank: { task: "Reranking" },
  moderation: { task: "Moderation" },
  extraction: { task: "Data extraction" },
  ocr: { task: "Text extraction", output: ["text"] },
  realtime: { task: "Realtime chat" },
};

function modalityLabel(modality: string): string {
  if (modality === "pdf") return "PDF";
  return modality.charAt(0).toUpperCase() + modality.slice(1);
}

/** Describe what a model does without inferring capabilities from its name or lab. */
export function discoveryModality(
  model: Pick<DiscoveryModel, "mode" | "inputModalities" | "outputModalities">,
): { task: string; flow: string | null } {
  const mode = model.mode ? MODE_MODALITIES[model.mode] : undefined;
  const inputs = model.inputModalities.length
    ? model.inputModalities
    : mode?.input ?? [];
  const outputs = model.outputModalities.length
    ? model.outputModalities
    : mode?.output ?? [];
  const input = inputs.map(modalityLabel).join(" + ");
  const output = outputs.map(modalityLabel).join(" + ");
  const flow =
    input && output
      ? `${input} → ${output}`
      : input
        ? `Input: ${input}`
        : output
          ? `Output: ${output}`
          : null;
  return {
    task:
      model.mode === "responses" &&
      new Set([...model.inputModalities, ...model.outputModalities]).size > 1
        ? "Multimodal"
        : mode?.task ?? (flow ? "Modalities" : "Modality not listed"),
    flow,
  };
}
