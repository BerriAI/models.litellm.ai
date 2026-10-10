/** Site-wide constants. SITE_URL lets the same build serve another host, such as docs.litellm.ai/models. */

export const SITE_URL = (process.env.SITE_URL || "https://models.litellm.ai").replace(/\/$/, "");
export const SITE_NAME = "LiteLLM Model Catalog";
export const DOCS_URL = "https://docs.litellm.ai";
export const GITHUB_URL = "https://github.com/BerriAI/litellm";
export const PRICE_FILE_URL = "https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json";
export const COST_MAP_RAW_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
export const PROVIDER_SUPPORT_RAW_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/provider_endpoints_support.json";

export const modelPath = (slug: string) => `/models/${slug}`;
export const providerPath = (hub: string) => `/providers/${hub}`;
export const abs = (path: string) => `${SITE_URL}${path}`;
