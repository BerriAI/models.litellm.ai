import { describe, expect, it } from "vitest";
import {
  EMPTY_MODELS_DEV_INDEX,
  buildModelsDevIndex,
  compareReleaseDates,
  deriveModelMeta,
  formatReleaseDate,
  formatReleaseMonth,
  humanizeModelId,
  releaseDateFromId,
  type ModelsDevApi,
} from "./modelMeta";

const api: ModelsDevApi = {
  openai: {
    models: {
      "gpt-4o": { name: "GPT-4o", release_date: "2024-05-13" },
      "gpt-4o-2024-05-13": {
        name: "GPT-4o (2024-05-13)",
        release_date: "2024-05-13",
      },
      "gpt-4o-mini": { name: "GPT-4o mini", release_date: "2024-07-18" },
    },
  },
  anthropic: {
    models: {
      "claude-3-5-sonnet-20241022": {
        name: "Claude Sonnet 3.5 v2",
        release_date: "2024-10-22",
      },
      "claude-sonnet-4-20250514": {
        name: "Claude Sonnet 4",
        release_date: "2025-05-22",
      },
    },
  },
  "amazon-bedrock": {
    models: {
      "us.anthropic.claude-haiku-4-5-20251001-v1:0": {
        name: "Claude Haiku 4.5 (US)",
        release_date: "2025-10-15",
      },
      "openai.gpt-oss-120b-1:0": {
        name: "gpt-oss-120b",
        release_date: "2025-08-05",
      },
    },
  },
  "google-vertex-anthropic": {
    models: {
      "claude-sonnet-4@20250514": {
        name: "Claude Sonnet 4",
        release_date: "2025-05-22",
      },
    },
  },
  "aggregator-one": {
    models: {
      "claude-sonnet-4-20250514": { name: "claude-sonnet-4-20250514" },
      "o3-pro": { name: "o3-pro", release_date: "2025-06-10" },
      "openai/gpt-4o": { name: "OpenAI: GPT-4o", release_date: "2026-01" },
      "gpt-4o-mini-2024-07-18": {
        name: "OpenAI: GPT-4o-mini (2024-07-18)",
        release_date: "2024-07-18",
      },
      "mythical-1": { name: "Vendor: Mythical 1", release_date: "2025-03-01" },
      "gemini-2.5-pro": { name: "Gemini-2.5-Pro", release_date: "2026-01" },
    },
  },
  "aggregator-two": {
    models: {
      "claude-sonnet-4-20250514": { name: "claude-sonnet-4-20250514" },
      "o3-pro": { name: "o3-pro", release_date: "2025-06-10" },
      "gemini-2.5-pro": { name: "Gemini 2.5 Pro", release_date: "2025-06-17" },
      "nameless-model": { release_date: "2025-01-01" },
    },
  },
  "aggregator-three": {
    models: {
      "claude-sonnet-4-20250514": { name: "claude-sonnet-4-20250514" },
      "gemini-2.5-pro": { name: "Gemini 2.5 Pro", release_date: "2025-06-17" },
    },
  },
};

const index = buildModelsDevIndex(api);

describe("deriveModelMeta with a models.dev index", () => {
  it("matches a provider-prefixed litellm id by its tail and keeps the first-party name", () => {
    expect(deriveModelMeta("azure/gpt-4o", index)).toEqual({
      display_name: "GPT-4o",
      release_date: "2024-05-13",
    });
  });

  it("takes the majority name and date when aggregators disagree", () => {
    expect(deriveModelMeta("gemini/gemini-2.5-pro", index)).toEqual({
      display_name: "Gemini 2.5 Pro",
      release_date: "2025-06-17",
    });
  });

  it("prefers the models.dev release date over the snapshot date embedded in an exactly matched id", () => {
    expect(
      deriveModelMeta("claude-sonnet-4-20250514", index).release_date,
    ).toBe("2025-05-22");
    expect(
      deriveModelMeta("vertex_ai/claude-sonnet-4@20250514", index).release_date,
    ).toBe("2025-05-22");
  });

  it("uses the id's own date when the match only happened after stripping it", () => {
    expect(deriveModelMeta("openai/gpt-4o-2024-08-06", index)).toEqual({
      display_name: "GPT-4o",
      release_date: "2024-08-06",
    });
  });

  it("resolves bedrock vendor and version affixes to the vendor's own entry", () => {
    expect(
      deriveModelMeta(
        "bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0",
        index,
      ),
    ).toEqual({
      display_name: "Claude Sonnet 3.5 v2",
      release_date: "2024-10-22",
    });
  });

  it("takes the region suffix from the litellm id, never from the source name", () => {
    expect(
      deriveModelMeta("anthropic.claude-haiku-4-5-20251001-v1:0", index)
        .display_name,
    ).toBe("Claude Haiku 4.5");
    expect(
      deriveModelMeta("us.anthropic.claude-haiku-4-5-20251001-v1:0", index)
        .display_name,
    ).toBe("Claude Haiku 4.5 (US)");
    expect(
      deriveModelMeta("eu.anthropic.claude-haiku-4-5-20251001-v1:0", index)
        .display_name,
    ).toBe("Claude Haiku 4.5 (EU)");
    expect(
      deriveModelMeta("global.anthropic.claude-haiku-4-5-20251001-v1:0", index)
        .display_name,
    ).toBe("Claude Haiku 4.5 (Global)");
    expect(
      deriveModelMeta("bedrock/us.amazon.nova-canvas-v1:0", index).display_name,
    ).toBe("Nova Canvas v1 (US)");
  });

  it("keeps fine-tune and image qualifiers around a matched name", () => {
    expect(deriveModelMeta("ft:gpt-4o-mini", index).display_name).toBe(
      "Fine-tuned GPT-4o mini",
    );
    expect(
      deriveModelMeta("1024-x-1024/50-steps/bedrock/gpt-4o", index)
        .display_name,
    ).toBe("GPT-4o · 1024×1024, 50 steps");
  });

  it("prefers the first-party name over aggregators echoing the raw id", () => {
    expect(deriveModelMeta("claude-sonnet-4-20250514", index)).toEqual({
      display_name: "Claude Sonnet 4",
      release_date: "2025-05-22",
    });
  });

  it("prefers a first-party name for a nearby id over an aggregator's name for the exact id", () => {
    expect(deriveModelMeta("ft:gpt-4o-mini-2024-07-18", index)).toEqual({
      display_name: "Fine-tuned GPT-4o mini",
      release_date: "2024-07-18",
    });
  });

  it("drops an aggregator's vendor prefix from the name", () => {
    expect(deriveModelMeta("mythical-1", index)).toEqual({
      display_name: "Mythical 1",
      release_date: "2025-03-01",
    });
  });

  it("humanizes the id when every source only echoes the raw id", () => {
    expect(deriveModelMeta("o3-pro", index)).toEqual({
      display_name: "o3 Pro",
      release_date: "2025-06-10",
    });
    expect(deriveModelMeta("openai.gpt-oss-120b-1:0", index)).toEqual({
      display_name: "GPT OSS 120B",
      release_date: "2025-08-05",
    });
  });

  it("ignores models.dev entries without a name", () => {
    expect(deriveModelMeta("nameless-model", index)).toEqual({
      display_name: "Nameless Model",
      release_date: null,
    });
  });

  it("falls back to a humanized id with no date when nothing matches", () => {
    expect(
      deriveModelMeta(
        "512-x-512/max-steps/stability.stable-diffusion-xl-v0",
        EMPTY_MODELS_DEV_INDEX,
      ),
    ).toEqual({
      display_name: "Stable Diffusion XL v0 · 512×512, max steps",
      release_date: null,
    });
  });
});

describe("humanizeModelId", () => {
  it.each([
    ["1024-x-1024/dall-e-2", "DALL·E 2"],
    ["gpt-4o-mini-2024-07-18", "GPT-4o Mini"],
    ["gpt-3.5-turbo-instruct", "GPT-3.5 Turbo Instruct"],
    ["tts-1-hd", "TTS-1 HD"],
    ["text-embedding-3-large", "Text Embedding 3 Large"],
    ["bedrock/amazon.nova-canvas-v1:0", "Nova Canvas v1"],
    ["eu.anthropic.claude-3-5-sonnet-20241022-v2:0", "Claude 3.5 Sonnet v2"],
    [
      "accounts/fireworks/models/llama-v3p1-70b-instruct",
      "Llama v3p1 70B Instruct",
    ],
    ["mistral/open-mixtral-8x7b", "Open Mixtral 8x7B"],
    ["sambanova/Meta-Llama-3.1-8B-Instruct", "Meta Llama 3.1 8B Instruct"],
    ["o1-mini-2024-09-12", "o1 Mini"],
    ["chatgpt-4o-latest", "ChatGPT-4o Latest"],
    ["deepseek/deepseek-r1-distill-llama-70b", "DeepSeek R1 Distill Llama 70B"],
    ["cohere/command-r7b-12-2024", "Command R7B 12 2024"],
    ["ft:babbage-002", "Babbage 002"],
  ])("%s -> %s", (id, expected) => {
    expect(humanizeModelId(id)).toBe(expected);
  });
});

describe("releaseDateFromId", () => {
  it.each([
    ["gpt-4o-2024-05-13", "2024-05-13"],
    ["azure/eu/gpt-4o-mini-2024-07-18", "2024-07-18"],
    ["claude-3-5-sonnet-20241022", "2024-10-22"],
    ["vertex_ai/claude-sonnet-4@20250514", "2025-05-14"],
    ["gpt-4-0613", null],
    ["mistral-large-2407", null],
    ["claude-3-5-sonnet-20241322", null],
    ["gemini-1.5-pro-002", null],
  ])("%s -> %s", (id, expected) => {
    expect(releaseDateFromId(id)).toBe(expected);
  });
});

describe("compareReleaseDates", () => {
  const dates: readonly (string | null)[] = [
    null,
    "2024-05-13",
    "2025-09",
    "2025-06-17",
    null,
  ];

  it("puts undated models last when sorting newest first", () => {
    expect(
      [...dates].sort((a, b) => compareReleaseDates(a, b, "desc")),
    ).toEqual(["2025-09", "2025-06-17", "2024-05-13", null, null]);
  });

  it("still puts undated models last when sorting oldest first", () => {
    expect([...dates].sort((a, b) => compareReleaseDates(a, b, "asc"))).toEqual(
      ["2024-05-13", "2025-06-17", "2025-09", null, null],
    );
  });
});

describe("release date formatting", () => {
  it("shows the month in the table and the full date in the detail panel", () => {
    expect(formatReleaseMonth("2024-05-13")).toBe("May 2024");
    expect(formatReleaseDate("2024-05-13")).toBe("May 13, 2024");
    expect(formatReleaseMonth("2025-09")).toBe("Sep 2025");
    expect(formatReleaseDate("2025-09")).toBe("Sep 2025");
    expect(formatReleaseMonth(null)).toBe("—");
    expect(formatReleaseDate(null)).toBe("—");
  });
});
