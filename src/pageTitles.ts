export type Tab =
  | "benchmarks"
  | "discover"
  | "changelog"
  | "models"
  | "providers"
  | "cookbook"
  | "guardrails";

/** The <title> each app route is built with; the app sets it again when a tab switch changes the route. */
export const PAGE_TITLES: Record<Tab, string> = {
  benchmarks: "AI Model Benchmarks | LiteLLM",
  discover: "Discover AI Models | LiteLLM",
  changelog: "Model Changelog | LiteLLM",
  models: "LiteLLM Model Catalog: AI Model Pricing & Context Windows",
  providers: "AI Provider Integrations and Supported Endpoints | LiteLLM",
  cookbook: "AI Tool Guides | LiteLLM Cookbook",
  guardrails: "Custom Code Guardrails | LiteLLM",
};
