export type Tab = "models" | "providers" | "cookbook" | "guardrails";

/** The <title> each app route is built with; the app sets it again when a tab switch changes the route. */
export const PAGE_TITLES: Record<Tab, string> = {
  models: "LiteLLM Model Catalog: AI Model Pricing & Context Windows",
  providers: "AI Provider Integrations and Supported Endpoints | LiteLLM",
  cookbook: "AI Tool Guides | LiteLLM Cookbook",
  guardrails: "Custom Code Guardrails | LiteLLM",
};
