import { describe, expect, test } from "vitest";
import { getProviderDisplayName, getProviderLogo } from "./providers";

describe("provider display names", () => {
  test.each([
    ["bedrock", "Amazon Bedrock"],
    ["bedrock_converse", "Bedrock Converse"],
    ["bedrock_mantle", "Amazon Bedrock Mantle"],
    ["openai", "OpenAI"],
    ["vertex_ai", "Google Vertex AI"],
    ["huggingface", "Hugging Face"],
    ["xai", "xAI"],
    ["aiand", "ai&"],
  ])("should display %s as %s", (provider, name) => {
    expect(getProviderDisplayName(provider)).toBe(name);
  });

  test("should normalize case and whitespace for known providers", () => {
    expect(getProviderDisplayName(" BEDROCK_MANTLE ")).toBe(
      "Amazon Bedrock Mantle",
    );
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

describe("provider logos", () => {
  test.each(["zai", "ZAI", "Z.ai", "z.ai", " Z.ai "])(
    "should reuse the bundled Z.ai artwork for %s",
    (provider) => {
      expect(getProviderLogo(provider)).toBe(
        "/provider-logos/upstream/zai.svg",
      );
    },
  );

  test("should preserve other provider mappings and unknown-name fallbacks", () => {
    expect(getProviderLogo("openai")).toBe(
      "/provider-logos/upstream/openai.svg",
    );
    expect(getProviderLogo("Unknown lab")).toBeNull();
    expect(getProviderLogo("constructor")).toBeNull();
  });
});
