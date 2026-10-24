import { describe, expect, it } from "vitest";
import { catalogModelId, parseLiteLLMModelId } from "./litellmModelId";

describe("copyable LiteLLM identifiers", () => {
  it.each([
    "cloudflare/clairic",
    "cloudflare/@cf/cloudflare/clairic",
    "vertex_ai/gemini-model",
    "bedrock/us.anthropic.claude-model-v1:0",
  ])("should preserve the catalog routing identifier %s", (id) => {
    expect(parseLiteLLMModelId(id)).toBe(id);
  });
  it.each([
    undefined,
    null,
    "",
    "https://example.com/model",
    "provider/model\ncommand",
    "model --argument",
    "$(command)",
    "model?key=value",
  ])("should reject missing or non-identifier values %j", (id) => {
    expect(parseLiteLLMModelId(id)).toBeNull();
  });
  it("should copy a supported route even when an unpriced model has no headline", () => {
    expect(
      catalogModelId({
        headline: null,
        rows: [{ modelString: "meta/sam-3.1" }],
        status: "active",
      }),
    ).toBe("meta/sam-3.1");
  });
  it("should prefer the headline and skip expired or invalid routes", () => {
    const rows = [
      { modelString: "expired", deprecation: "2026-10-01" },
      { modelString: "https://invalid.example/route" },
      { modelString: "provider/current" },
    ];
    expect(
      catalogModelId(
        { headline: { modelString: "provider/preferred" }, rows },
        "2026-10-24",
      ),
    ).toBe("provider/preferred");
    expect(catalogModelId({ headline: null, rows }, "2026-10-24")).toBe(
      "provider/current",
    );
    expect(
      catalogModelId({ headline: null, rows, status: "retired" }, "2026-10-24"),
    ).toBeNull();
  });
});
