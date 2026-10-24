import { describe, expect, test } from "vitest";
import { getProviderDisplayName } from "./providers";

describe("provider display names", () => {
  test.each([
    ["bedrock", "Amazon Bedrock"],
    ["bedrock_converse", "Bedrock Converse"],
    ["bedrock_mantle", "Bedrock Mantle"],
    ["openai", "OpenAI"],
    ["vertex_ai", "Google Vertex AI"],
    ["huggingface", "Hugging Face"],
    ["xai", "xAI"],
  ])("should display %s as %s", (provider, name) => {
    expect(getProviderDisplayName(provider)).toBe(name);
  });

  test("should normalize case and whitespace for known providers", () => {
    expect(getProviderDisplayName(" BEDROCK_MANTLE ")).toBe("Bedrock Mantle");
  });

  test("should format unknown provider ids without exposing separators", () => {
    expect(getProviderDisplayName("custom_cloud-ai")).toBe("Custom Cloud AI");
  });

  test.each(["", "  ", null, undefined])(
    "should show a placeholder for a missing provider (%s)",
    (provider) => {
      expect(getProviderDisplayName(provider)).toBe("—");
    },
  );
});
