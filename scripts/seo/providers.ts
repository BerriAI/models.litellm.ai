/** Provider display names, provider hub ids, docs links and model labs. */
import { getProviderDisplayName, PROVIDER_DISPLAY_NAMES } from "../../src/providers";

export type ProviderSupport = {
  providers?: Record<string, { display_name?: string; url?: string; endpoints?: Record<string, boolean> }>;
  /** Endpoint metadata: `provider_json_field` is the key used in each provider's `endpoints`. */
  endpoints?: Record<string, { display_name?: string; leftnav_label?: string; provider_json_field?: string; url?: string }>;
};

/** Route variants that belong to one provider hub. */
export function hubProvider(provider: string): string {
  if (provider.startsWith("vertex_ai")) return "vertex_ai";
  if (provider === "bedrock_converse") return "bedrock";
  if (provider === "fireworks_ai-embedding-models") return "fireworks_ai";
  if (provider === "text-completion-openai") return "openai";
  if (provider === "text-completion-inception") return "inception";
  if (provider === "cohere_chat") return "cohere";
  return provider;
}

function stripDocsLabel(label: string): string {
  return label.replace(/\s*\(`[^`]*`\)\s*$/, "").trim();
}

export function providerName(provider: string, support: ProviderSupport): string {
  const hub = hubProvider(provider);
  return (
    PROVIDER_DISPLAY_NAMES[hub] ??
    (support.providers?.[hub]?.display_name
      ? stripDocsLabel(support.providers[hub].display_name!)
      : getProviderDisplayName(hub))
  );
}

export function providerDocsUrl(provider: string, support: ProviderSupport): string | undefined {
  const url = support.providers?.[hubProvider(provider)]?.url;
  return url?.startsWith("https://docs.litellm.ai/") ? url : undefined;
}

/** The lab behind each first-party API, so Perplexity counts as first-party for Sonar but not for Claude. */
const PROVIDER_LABS: Record<string, string> = {
  openai: "OpenAI",
  "text-completion-openai": "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google",
  "vertex_ai-language-models": "Google",
  mistral: "Mistral AI",
  xai: "xAI",
  deepseek: "DeepSeek",
  cohere: "Cohere",
  cohere_chat: "Cohere",
  moonshot: "Moonshot AI",
  dashscope: "Alibaba",
  zai: "Z.ai",
  minimax: "MiniMax",
  perplexity: "Perplexity",
  ai21: "AI21 Labs",
  amazon_nova: "Amazon",
  voyage: "Voyage AI",
  stability: "Stability AI",
  black_forest_labs: "Black Forest Labs",
  recraft: "Recraft",
  meta_llama: "Meta",
  xiaomi_mimo: "Xiaomi",
  inception: "Inception Labs",
  jina_ai: "Jina AI",
  elevenlabs: "ElevenLabs",
};

/** A provider is first-party when it is the model's own lab, or when the lab is unknown. */
export function isLabProvider(provider: string, lab: string | null): boolean {
  const own = PROVIDER_LABS[provider];
  return !lab || !own || own === lab;
}

const LAB_RULES: [RegExp, string][] = [
  [/^claude/, "Anthropic"],
  [/^(gpt|o\d|chatgpt|dall-e|whisper|tts-1|text-embedding-3|text-embedding-ada|gpt-image|sora|davinci|babbage|codex|omni-moderation|text-moderation|computer-use)/, "OpenAI"],
  [/^(gemini|gemma|imagen|veo|nano-banana|chirp|lyria|learnlm|text-embedding-00|text-multilingual-embedding|multimodalembedding)/, "Google"],
  [/^llama/, "Meta"],
  // The price file lists these under the `meta` provider (Meta Model API).
  [/^muse-(spark|wonder|voice|image)/, "Meta"],
  [/^(mistral|mixtral|codestral|ministral|pixtral|magistral|devstral|voxtral|open-mistral|open-mixtral)/, "Mistral AI"],
  [/^deepseek/, "DeepSeek"],
  [/^(qwen|qwq)/, "Alibaba"],
  [/^grok/, "xAI"],
  [/^(kimi|moonshot)/, "Moonshot AI"],
  [/^(glm|chatglm|cogview)/, "Z.ai"],
  [/^(minimax|abab)/, "MiniMax"],
  [/^(command|embed-(english|multilingual)|rerank-(english|multilingual|v)|c4ai|aya)/, "Cohere"],
  [/^(nova|titan)/, "Amazon"],
  [/^phi-?\d/, "Microsoft"],
  [/^jamba/, "AI21 Labs"],
  [/^flux/, "Black Forest Labs"],
  [/^(stable-|sd3|sdxl)/, "Stability AI"],
  [/^sonar/, "Perplexity"],
  [/^voyage/, "Voyage AI"],
  [/^nemotron/, "NVIDIA"],
  [/^ernie/, "Baidu"],
  [/^hunyuan/, "Tencent"],
  [/^(seedream|seedance|doubao)/, "ByteDance"],
  [/^kling/, "Kuaishou"],
  [/^recraft/, "Recraft"],
  [/^ideogram/, "Ideogram"],
  [/^mimo/, "Xiaomi"],
  [/^jina/, "Jina AI"],
  [/^eleven/, "ElevenLabs"],
  [/^mercury/, "Inception Labs"],
];

const VENDOR_LABS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  meta: "Meta",
  "meta-llama": "Meta",
  mistral: "Mistral AI",
  mistralai: "Mistral AI",
  deepseek: "DeepSeek",
  "deepseek-ai": "DeepSeek",
  qwen: "Alibaba",
  xai: "xAI",
  "x-ai": "xAI",
  moonshot: "Moonshot AI",
  moonshotai: "Moonshot AI",
  amazon: "Amazon",
  cohere: "Cohere",
  ai21: "AI21 Labs",
  minimax: "MiniMax",
  "z-ai": "Z.ai",
  zai: "Z.ai",
  "zai-org": "Z.ai",
  nvidia: "NVIDIA",
  microsoft: "Microsoft",
  "black-forest-labs": "Black Forest Labs",
  stability: "Stability AI",
  bytedance: "ByteDance",
};

export function labFor(slug: string, vendors: (string | null)[]): string | null {
  for (const [rx, lab] of LAB_RULES) if (rx.test(slug)) return lab;
  for (const v of vendors) if (v && VENDOR_LABS[v]) return VENDOR_LABS[v];
  return null;
}
