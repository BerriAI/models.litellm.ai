export type ModelMeta = {
  readonly display_name: string;
  readonly release_date: string | null;
};

type ModelsDevModel = {
  readonly name?: unknown;
  readonly release_date?: unknown;
};

type ModelsDevProvider = {
  readonly models?: Readonly<Record<string, ModelsDevModel>>;
};

export type ModelsDevApi = Readonly<Record<string, ModelsDevProvider>>;

type IndexedEntry = {
  readonly rank: number;
  readonly name: string;
  readonly date: string | null;
  readonly provider: string;
  readonly raw: boolean;
};

export type ModelsDevIndex = ReadonlyMap<string, readonly IndexedEntry[]>;

type Candidate = {
  readonly key: string;
  readonly rank: number;
  readonly dateStripped: boolean;
};

type Hit = {
  readonly name: string;
  readonly raw: boolean;
  readonly date: string | null;
  readonly dateStripped: boolean;
};

export const MODELS_DEV_API_URL = "https://models.dev/api.json";
export const EMPTY_MODELS_DEV_INDEX: ModelsDevIndex = new Map();
const FIRST_PARTY_PROVIDERS: ReadonlySet<string> = new Set([
  "openai",
  "anthropic",
  "google",
  "google-vertex",
  "google-vertex-anthropic",
  "amazon-bedrock",
  "azure",
  "mistral",
  "xai",
  "deepseek",
  "groq",
  "cohere",
  "meta",
  "moonshotai",
  "alibaba",
  "zai",
  "minimax",
  "perplexity",
  "fireworks-ai",
  "cerebras",
  "inception",
]);

const FINE_TUNE_PREFIX = /^ft:/;
const REGION_PREFIX = /^(?:us|eu|apac|global|jp|au|ca|us-gov)\./;
const VENDOR_PREFIX = /^[a-z0-9-]+\.(?=[a-z])/;
const AT_SUFFIX = /@[^/]*$/;
const VERSION_TAG_SUFFIX = /-\d+:\d+$|:\d+$/;
const VERSION_SUFFIX = /-v?\d+:\d+$|-v\d+$|:\d+$/;
const ISO_DATE = /(20\d{2})-(\d{2})-(\d{2})(?!\d)/;
const COMPACT_DATE = /[-@.:](20\d{2})(\d{2})(\d{2})(?!\d)/;
const FULL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_DATE = /^(\d{4})-(\d{2})$/;
const REGION_NAME_SUFFIX = /\s\((?:us|eu|apac|global|jp|au|ca|us-gov)\)$/i;
const SIZE_QUALIFIER = /^(\d+)-x-(\d+)$/;
const STEPS_QUALIFIER = /^(\d+|max)-steps$/;
const SIZED_TOKEN = /^(?:\d+(?:\.\d+)?|\d+x\d+|[a-z]\d+)[bkm]$/;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const ACRONYMS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    gpt: "GPT",
    chatgpt: "ChatGPT",
    tts: "TTS",
    stt: "STT",
    hd: "HD",
    xl: "XL",
    ai: "AI",
    sdxl: "SDXL",
    sd3: "SD3",
    llm: "LLM",
    moe: "MoE",
    oss: "OSS",
    vl: "VL",
    it: "IT",
    "dall·e": "DALL·E",
    deepseek: "DeepSeek",
    openai: "OpenAI",
    xai: "xAI",
    ai21: "AI21",
    glm: "GLM",
    mpt: "MPT",
    codellama: "CodeLlama",
    wizardlm: "WizardLM",
    minimax: "MiniMax",
    pplx: "PPLX",
    smollm: "SmolLM",
    dbrx: "DBRX",
    bge: "BGE",
    gte: "GTE",
    qwq: "QwQ",
    flux: "FLUX",
    hf: "HF",
    api: "API",
    maas: "MaaS",
    sft: "SFT",
    fp8: "FP8",
    int4: "INT4",
    awq: "AWQ",
    gguf: "GGUF",
  }),
);
const HYPHENATED_ACRONYMS: ReadonlySet<string> = new Set([
  "GPT",
  "ChatGPT",
  "TTS",
  "STT",
]);

const validDate = (
  year: string,
  month: string,
  day: string | null,
): string | null => {
  const m = Number(month);
  const d = day === null ? 1 : Number(day);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return day === null ? `${year}-${month}` : `${year}-${month}-${day}`;
};

export function releaseDateFromId(id: string): string | null {
  const iso = ISO_DATE.exec(id);
  if (iso) return validDate(iso[1], iso[2], iso[3]);
  const compact = COMPACT_DATE.exec(id);
  if (compact) return validDate(compact[1], compact[2], compact[3]);
  return null;
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const full = FULL_DATE.exec(trimmed);
  if (full) return validDate(full[1], full[2], full[3]);
  const month = MONTH_DATE.exec(trimmed);
  if (month) return validDate(month[1], month[2], null);
  return null;
}

const tailOf = (id: string): string => id.slice(id.lastIndexOf("/") + 1);

const stripDates = (key: string): string =>
  key.replace(ISO_DATE, "").replace(COMPACT_DATE, "").replace(/-+$/, "");

const KEY_STEPS: readonly ((key: string) => string)[] = [
  tailOf,
  (key) => key.replace(FINE_TUNE_PREFIX, ""),
  (key) => key.replace(REGION_PREFIX, ""),
  (key) => key.replace(VENDOR_PREFIX, ""),
  (key) => key.replace(AT_SUFFIX, ""),
  (key) => key.replace(VERSION_SUFFIX, ""),
  stripDates,
];

export function candidateKeys(id: string): readonly Candidate[] {
  const lower = id.toLowerCase();
  const idDate = releaseDateFromId(lower);
  const keys = KEY_STEPS.reduce<readonly { key: string; rank: number }[]>(
    (acc, step, i) => {
      const prev = acc[acc.length - 1].key;
      const next = step(prev);
      return next === prev || next === ""
        ? acc
        : [...acc, { key: next, rank: i + 1 }];
    },
    [{ key: lower, rank: 0 }],
  );
  return keys.map(({ key, rank }) => ({
    key,
    rank,
    dateStripped: idDate !== null && releaseDateFromId(key) === null,
  }));
}

const VENDOR_NAME_PREFIX = /^[A-Za-z0-9 .]+: /;

const ID_LIKE_NAME = /^[^\s]*[-_.\d][^\s]*$/;

const isRawName = (name: string, modelId: string): boolean =>
  ID_LIKE_NAME.test(name) && modelId.toLowerCase().includes(name.toLowerCase());

export function buildModelsDevIndex(api: ModelsDevApi): ModelsDevIndex {
  const entries = Object.entries(api).flatMap(([provider, { models }]) =>
    Object.entries(models ?? {}).flatMap(([modelId, model]) => {
      const name =
        typeof model.name === "string"
          ? model.name.trim().replace(VENDOR_NAME_PREFIX, "")
          : "";
      if (name === "") return [];
      const date = normalizeDate(model.release_date);
      const raw = isRawName(name, modelId);
      return candidateKeys(modelId).map(
        ({ key, rank }) => [key, { rank, name, date, provider, raw }] as const,
      );
    }),
  );
  return entries.reduce(
    (index, [key, entry]) => index.set(key, [...(index.get(key) ?? []), entry]),
    new Map<string, readonly IndexedEntry[]>(),
  );
}

function mode(values: readonly string[]): string | null {
  const counts = values.reduce(
    (acc, value) => acc.set(value, (acc.get(value) ?? 0) + 1),
    new Map<string, number>(),
  );
  const best = [...counts.entries()].reduce<readonly [string, number] | null>(
    (winner, current) =>
      winner === null || current[1] > winner[1] ? current : winner,
    null,
  );
  return best === null ? null : best[0];
}

const SOURCE_POOLS: readonly ((entry: IndexedEntry) => boolean)[] = [
  (entry) => FIRST_PARTY_PROVIDERS.has(entry.provider),
  (entry) => !entry.raw,
  () => true,
];

function pickHit(
  entries: readonly IndexedEntry[],
  dateStripped: boolean,
): Hit | null {
  const bestRank = Math.min(...entries.map((entry) => entry.rank));
  const bucket = entries.filter((entry) => entry.rank === bestRank);
  const name = mode(bucket.map((entry) => entry.name));
  if (name === null) return null;
  const raw = bucket
    .filter((entry) => entry.name === name)
    .every((entry) => entry.raw);
  const dates = bucket
    .map((entry) => entry.date)
    .filter((date): date is string => date !== null);
  const date =
    mode(dates.filter((date) => FULL_DATE.test(date))) ?? mode(dates);
  return { name, raw, date, dateStripped };
}

function lookupModelsDev(index: ModelsDevIndex, id: string): Hit | null {
  const candidates = candidateKeys(id);
  for (const inPool of SOURCE_POOLS) {
    for (const candidate of candidates) {
      const entries = (index.get(candidate.key) ?? []).filter(inPool);
      if (entries.length === 0) continue;
      const hit = pickHit(entries, candidate.dateStripped);
      if (hit !== null) return hit;
    }
  }
  return null;
}

function formatToken(token: string): string {
  const acronym = ACRONYMS.get(token);
  if (acronym !== undefined) return acronym;
  if (SIZED_TOKEN.test(token)) {
    return token
      .replace(/[bkm]$/, (unit) => unit.toUpperCase())
      .replace(/^[a-z]/, (c) => c.toUpperCase());
  }
  if (/^o\d/.test(token) || /^v\d/.test(token) || /^\d/.test(token))
    return token;
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function joinTokens(tokens: readonly string[]): string {
  return tokens.reduce((out, token, i) => {
    if (i === 0) return token;
    const prev = tokens[i - 1];
    const separator =
      HYPHENATED_ACRONYMS.has(prev) && /^\d/.test(token)
        ? "-"
        : /^\d$/.test(prev) && /^\d{1,2}$/.test(token)
          ? "."
          : " ";
    return out + separator + token;
  }, "");
}

export function humanizeModelId(id: string): string {
  const base = tailOf(id)
    .toLowerCase()
    .replace(FINE_TUNE_PREFIX, "")
    .replace(REGION_PREFIX, "")
    .replace(VENDOR_PREFIX, "")
    .replace(AT_SUFFIX, "")
    .replace(VERSION_TAG_SUFFIX, "");
  const tokens = stripDates(base)
    .replace(/dall-e/g, "dall·e")
    .split(/[-_]+/)
    .filter((token) => token !== "")
    .map(formatToken);
  return joinTokens(tokens);
}

function qualifiers(id: string): readonly string[] {
  return id
    .split("/")
    .slice(0, -1)
    .flatMap((segment) => {
      const size = SIZE_QUALIFIER.exec(segment);
      if (size) return [`${size[1]}×${size[2]}`];
      const steps = STEPS_QUALIFIER.exec(segment);
      if (steps) return [`${steps[1]} steps`];
      return [];
    });
}

function decorateName(name: string, id: string): string {
  const prefixed = FINE_TUNE_PREFIX.test(tailOf(id))
    ? `Fine-tuned ${name}`
    : name;
  const extras = qualifiers(id);
  return extras.length === 0 ? prefixed : `${prefixed} · ${extras.join(", ")}`;
}

function stripForeignRegion(name: string, id: string): string {
  const tail = tailOf(id).toLowerCase().replace(FINE_TUNE_PREFIX, "");
  return REGION_PREFIX.test(tail) ? name : name.replace(REGION_NAME_SUFFIX, "");
}

export function deriveModelMeta(id: string, index: ModelsDevIndex): ModelMeta {
  const idDate = releaseDateFromId(id);
  const hit = lookupModelsDev(index, id);
  const baseName =
    hit === null || hit.raw
      ? humanizeModelId(id)
      : stripForeignRegion(hit.name, id);
  const release_date =
    hit === null || hit.dateStripped
      ? idDate ?? hit?.date ?? null
      : hit.date ?? idDate;
  return { display_name: decorateName(baseName, id), release_date };
}

export function compareReleaseDates(
  a: string | null,
  b: string | null,
  direction: "asc" | "desc",
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const order = a < b ? -1 : a > b ? 1 : 0;
  return direction === "asc" ? order : -order;
}

export function formatReleaseMonth(date: string | null): string {
  if (date === null) return "—";
  return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

export function formatReleaseDate(date: string | null): string {
  if (date === null) return "—";
  if (date.length !== 10) return formatReleaseMonth(date);
  return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}, ${date.slice(0, 4)}`;
}
