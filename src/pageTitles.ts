export type Tab =
  | "evaluate"
  | "evaluate-sample"
  | "benchmarks"
  | "discover"
  | "models"
  | "providers"
  | "cookbook"
  | "guardrails";

/** The <title> each app route is built with; the app sets it again when a tab switch changes the route. */
export const PAGE_TITLES: Record<Tab, string> = {
  evaluate: "Evaluate Your Gateway Traffic | LiteLLM",
  "evaluate-sample": "Sample Evaluation Report | LiteLLM",
  benchmarks: "Coding Agent Benchmarks | LiteLLM",
  discover: "Discover AI Models | LiteLLM",
  models: "LiteLLM Model Catalog: AI Model Pricing & Context Windows",
  providers: "AI Provider Integrations and Supported Endpoints | LiteLLM",
  cookbook: "AI Tool Guides | LiteLLM Cookbook",
  guardrails: "Custom Code Guardrails | LiteLLM",
};
