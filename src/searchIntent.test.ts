import { describe, expect, it } from "vitest";
import { hasZeroListedPrice, searchIntent } from "./searchIntent";
import {
  indexModels,
  searchModels,
  searchCatalog,
  passesFilters,
  type SearchableModel,
} from "./modelSearch";

const filters = { provider: "", minInputTokens: null, minOutputTokens: null };
const models: SearchableModel[] = [
  {
    name: "claude-sonnet-4",
    display_name: "Claude Sonnet 4",
    litellm_provider: "anthropic",
    mode: "chat",
    input_cost_per_token: 1,
    output_cost_per_token: 2,
  },
  {
    name: "gpt-4o",
    display_name: "GPT 4o",
    litellm_provider: "openai",
    mode: "chat",
    supports_vision: true,
    supports_function_calling: true,
  },
  {
    name: "kimi-k2",
    display_name: "Kimi K2",
    litellm_provider: "moonshot",
    mode: "chat",
  },
  {
    name: "huaweicloud/example-model",
    display_name: "Example model",
    litellm_provider: "huaweicloud",
    mode: "chat",
  },
  {
    name: "claude-opus-4",
    display_name: "Claude Opus 4",
    litellm_provider: "anthropic",
    mode: "chat",
  },
  {
    name: "ollama/local-model",
    display_name: "Local model",
    litellm_provider: "ollama",
    mode: "chat",
    input_cost_per_token: 0,
    output_cost_per_token: 0,
  },
  {
    name: "openrouter/free-model",
    display_name: "Free model",
    litellm_provider: "openrouter",
    mode: "chat",
    input_cost_per_token: 0,
    output_cost_per_token: 0,
  },
  {
    name: "openrouter/paid-model",
    display_name: "Paid model",
    litellm_provider: "openrouter",
    mode: "chat",
    input_cost_per_token: 1,
    output_cost_per_token: 2,
  },
];

describe("model search intent", () => {
  it.each([
    ["calude", "claude-sonnet-4"],
    ["got", "gpt-4o"],
    ["kmi", "kimi-k2"],
    ["huawe", "huaweicloud/example-model"],
    ["opusop", "claude-opus-4"],
  ])("should find a catalog model for typo %s", (query, expected) => {
    expect(
      searchModels(indexModels(models), query, filters).map(
        (item) => item.name,
      ),
    ).toContain(expected);
  });

  it.each(["fre", "free", "Free", "  FREE "])(
    "should filter genuine zero-listed-price entries for %s",
    (query) => {
      expect(
        searchModels(indexModels(models), query, filters).map(
          (item) => item.name,
        ),
      ).toEqual(["ollama/local-model", "openrouter/free-model"]);
    },
  );

  it("should distinguish provider and tool requests from model names", () => {
    const index = indexModels(models);
    expect(
      searchModels(index, "openrouter", filters).map((item) => item.name),
    ).toEqual(["openrouter/free-model", "openrouter/paid-model"]);
    expect(
      searchModels(index, "ollama_chat", filters).map((item) => item.name),
    ).toEqual(["ollama/local-model"]);
    expect(searchIntent("opencode").href).toBe("/cookbook");
    expect(searchModels(index, "opencode", filters)).toEqual([]);
    expect(searchModels(index, "litellm", filters)).toEqual(models);
  });

  it("should count matching models hidden by a provider filter without calling them missing", () => {
    const index = indexModels(models);
    const result = searchCatalog(index, "claude", {
      ...filters,
      provider: "openai",
    });
    expect(result.items).toEqual([]);
    expect(result.hiddenCount).toBe(2);
    expect(searchCatalog(index, "claude", filters).items).toHaveLength(2);
  });

  it("should use reported output and input capabilities, with unknown capabilities excluded", () => {
    const image: SearchableModel = {
      name: "image",
      display_name: "Image",
      mode: "image_generation",
    };
    expect(passesFilters(image, { ...filters, output: "image" })).toBe(true);
    expect(passesFilters(image, { ...filters, output: "text" })).toBe(false);
    expect(
      passesFilters(models[1], {
        ...filters,
        inputs: ["text", "image"],
        toolsOnly: true,
      }),
    ).toBe(true);
    expect(passesFilters(models[2], { ...filters, inputs: ["image"] })).toBe(
      false,
    );
    expect(
      passesFilters(
        { ...models[2], supported_output_modalities: ["audio"] },
        { ...filters, output: "text" },
      ),
    ).toBe(false);
  });
});

describe("zero listed prices", () => {
  it.each([
    {},
    { input_cost_per_token: null, output_cost_per_token: null },
    { input_cost_per_token: "", output_cost_per_token: 0 },
    { input_cost_per_token: 0 },
    {
      input_cost_per_token: 0,
      output_cost_per_token: 0,
      input_cost_per_query: 0.001,
    },
    {
      input_cost_per_token: 0,
      output_cost_per_token: 0,
      output_cost_per_image: 0.04,
    },
    { input_cost_per_token: 0, output_cost_per_token: "unknown" },
  ])("should exclude missing or paid prices: %j", (prices) => {
    expect(hasZeroListedPrice({ mode: "chat", ...prices })).toBe(false);
  });

  it("should accept explicit numeric zero prices and normalized pricing slots", () => {
    expect(
      hasZeroListedPrice({
        mode: "chat",
        input_cost_per_token: "0",
        output_cost_per_token: 0,
      }),
    ).toBe(true);
    expect(
      hasZeroListedPrice({
        mode: "chat",
        pricing_slots: { input: { amount_usd: 0 }, output: { amount_usd: 0 } },
      }),
    ).toBe(true);
    expect(
      hasZeroListedPrice({ mode: "embedding", input_cost_per_token: 0 }),
    ).toBe(true);
  });
});
