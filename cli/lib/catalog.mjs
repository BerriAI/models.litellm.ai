import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const CATALOG_URL = "https://models.litellm.ai/compare/models.json";
export const MANIFEST_URL = "https://models.litellm.ai/models/manifest.json";
export const TOP_LABS = ["OpenAI", "Anthropic", "Google"];
const CACHE_TTL = 60 * 60 * 1000;
const TEXT_MODES = new Set(["chat", "responses", "completion"]);
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const number = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const text = (v) =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= 512 &&
  !/[\x00-\x1f\x7f-\x9f]/.test(v);
const date = (v) => typeof v === "string" && /^\d{4}-\d{2}(?:-\d{2})?$/.test(v);
const flag = (v) => (v === 1 ? true : v === 0 ? false : null);

/** Normalize the site's existing canonical catalog; no separate name or pricing rules. */
export function parseCatalog(catalog, manifest) {
  if (
    !object(catalog?.models) ||
    !object(manifest?.models) ||
    !date(manifest.buildDate)
  ) {
    throw new Error("The LiteLLM catalog has an unsupported format.");
  }
  const models = [];
  for (const [slug, row] of Object.entries(catalog.models)) {
    const meta = manifest.models[slug];
    if (
      !object(row) ||
      !object(meta) ||
      meta.status !== "active" ||
      !TEXT_MODES.has(meta.mode)
    )
      continue;
    if (
      !/^[a-z0-9][a-z0-9._-]*$/.test(slug) ||
      !text(row.n) ||
      !text(row.lab) ||
      !text(row.by)
    )
      continue;
    if (
      !number(row.in) ||
      !number(row.out) ||
      !number(row.ctx) ||
      !object(row.f)
    )
      continue;
    models.push({
      id: slug,
      modelId: text(meta.modelId) ? meta.modelId : null,
      name: row.n,
      lab: row.lab,
      input: row.in,
      output: row.out,
      context: row.ctx,
      maxOutput: number(row.mo) ? row.mo : null,
      features: {
        tools: flag(row.f.tools),
        reason: flag(row.f.reason),
        vision: flag(row.f.vision),
      },
      provider: row.by,
      added: date(meta.firstSeen)
        ? meta.firstSeen
        : date(row.add)
          ? row.add
          : null,
      url: `https://models.litellm.ai/models/${slug}`,
    });
  }
  if (!models.length)
    throw new Error("The LiteLLM catalog contains no active text models.");
  return { models, buildDate: manifest.buildDate };
}

async function fetchJson(url, fetchFn) {
  const response = await fetchFn(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok)
    throw new Error(`LiteLLM catalog request failed (${response.status}).`);
  return response.json();
}

/** Cache the original feeds together so offline reads use the same validation. */
export async function loadCatalog({
  refresh = false,
  offline = false,
  cacheDir = join(
    process.env.XDG_CACHE_HOME || join(homedir(), ".cache"),
    "prism",
  ),
  fetchFn = fetch,
  now = Date.now(),
} = {}) {
  const path = join(cacheDir, "catalog-v1.json");
  let cached = null;
  try {
    const raw = JSON.parse(await readFile(path, "utf8"));
    if (
      typeof raw.fetchedAt === "string" &&
      Number.isFinite(Date.parse(raw.fetchedAt))
    ) {
      cached = {
        ...parseCatalog(raw.catalog, raw.manifest),
        fetchedAt: raw.fetchedAt,
        cached: true,
      };
    }
  } catch {
    /* A missing or invalid cache triggers a fresh request. */
  }
  const age = cached ? now - Date.parse(cached.fetchedAt) : Infinity;
  const fresh = age >= 0 && age < CACHE_TTL;
  if (offline) {
    if (!cached)
      throw new Error(
        "No cached catalog. Run prism online once before using --offline.",
      );
    return { ...cached, stale: !fresh };
  }
  if (!refresh && fresh) return { ...cached, stale: false };
  try {
    const [catalog, manifest] = await Promise.all([
      fetchJson(CATALOG_URL, fetchFn),
      fetchJson(MANIFEST_URL, fetchFn),
    ]);
    const parsed = parseCatalog(catalog, manifest);
    const fetchedAt = new Date(now).toISOString();
    try {
      await mkdir(cacheDir, { recursive: true });
      const temporary = `${path}.${process.pid}.tmp`;
      await writeFile(
        temporary,
        JSON.stringify({ catalog, manifest, fetchedAt }),
        { mode: 0o600 },
      );
      await rename(temporary, path);
    } catch {
      /* Read-only cache directories must not prevent displaying live data. */
    }
    return { ...parsed, fetchedAt, cached: false, stale: false };
  } catch {
    if (cached) return { ...cached, stale: true };
    throw new Error(
      "Could not load LiteLLM's catalog. Check your connection and try again.",
    );
  }
}

function newest(a, b) {
  return (
    (b.added || "").localeCompare(a.added || "") ||
    a.name.localeCompare(b.name, "en", { numeric: true })
  );
}

export function selectModels(models, options) {
  const labs = options.labs.map((lab) => lab.toLowerCase());
  for (const lab of labs) {
    if (!models.some((model) => model.lab.toLowerCase() === lab)) {
      throw new Error(
        `Unknown lab: ${lab}. Use --all --json to see available labs.`,
      );
    }
  }
  const query = options.query.toLowerCase();
  let rows = models.filter(
    (model) =>
      (!labs.length || labs.includes(model.lab.toLowerCase())) &&
      (!query ||
        `${model.id} ${model.modelId || ""} ${model.name} ${model.lab}`
          .toLowerCase()
          .includes(query)),
  );
  const overview = !options.all && !labs.length && !query;
  if (overview) rows = rows.filter((model) => TOP_LABS.includes(model.lab));
  rows.sort(newest);
  const total = rows.length;
  const limit = options.limit ?? (overview ? 5 : Infinity);
  const counts = new Map();
  rows = rows.filter((row) => {
    const count = counts.get(row.lab) || 0;
    counts.set(row.lab, count + 1);
    return count < limit;
  });
  if (options.sort === "newest") rows.sort(newest);
  else if (options.sort === "name")
    rows.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  else if (options.sort) {
    const direction = options.sort === "context" ? -1 : 1;
    rows.sort(
      (a, b) => direction * (a[options.sort] - b[options.sort]) || newest(a, b),
    );
  } else {
    rows.sort((a, b) => {
      const rank = (lab) => {
        const i = TOP_LABS.indexOf(lab);
        return i < 0 ? TOP_LABS.length : i;
      };
      return (
        rank(a.lab) - rank(b.lab) || a.lab.localeCompare(b.lab) || newest(a, b)
      );
    });
  }
  return { models: rows, total, limited: rows.length < total };
}
