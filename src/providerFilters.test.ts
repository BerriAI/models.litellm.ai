import { describe, expect, it } from "vitest";
import {
  filterProviders,
  supportsEndpoint,
  type SearchableProvider,
} from "./providerFilters";

const providers: SearchableProvider[] = [
  {
    provider: "moonshot",
    display_name: "Moonshot AI",
    endpoints: { chat_completions: true },
  },
  {
    provider: "moonshot_audio",
    display_name: "Moonshot Audio",
    endpoints: { audio_transcription: true },
  },
  {
    provider: "moonshot_both",
    display_name: "Moonshot Both",
    endpoints: { chat_completions: true, audio_transcription: true },
  },
  {
    provider: "unrelated",
    display_name: "Other Provider",
    endpoints: { chat_completions: true },
  },
];

describe("provider searches with endpoint filters", () => {
  it("should count only matching providers hidden by the selected endpoint", () => {
    const result = filterProviders(providers, "moonshot", "chat_completions");
    expect(result.matching).toHaveLength(3);
    expect(result.visible.map((provider) => provider.provider)).toEqual([
      "moonshot",
      "moonshot_both",
    ]);
    expect(result.hiddenCount).toBe(1);
  });

  it("should restore all search matches when the endpoint filter is cleared", () => {
    const result = filterProviders(providers, "moonshot", "");
    expect(result.visible).toEqual(result.matching);
    expect(result.visible).toHaveLength(3);
    expect(result.hiddenCount).toBe(0);
  });

  it("should count bridged chat support as visible for a bridged endpoint", () => {
    const result = filterProviders(providers, "Moonshot AI", "responses", true);
    expect(result.visible.map((provider) => provider.provider)).toEqual([
      "moonshot",
    ]);
    expect(result.hiddenCount).toBe(0);
    expect(supportsEndpoint(providers[0], "responses", false)).toBe(false);
  });

  it("should trim the query and match display names without case sensitivity", () => {
    expect(
      filterProviders(providers, "  MOONSHOT AUDIO  ", "chat_completions")
        .hiddenCount,
    ).toBe(1);
  });

  it("should distinguish no matching providers from matches hidden by a filter", () => {
    const result = filterProviders(providers, "missing", "chat_completions");
    expect(result.matching).toEqual([]);
    expect(result.visible).toEqual([]);
    expect(result.hiddenCount).toBe(0);
  });
});
