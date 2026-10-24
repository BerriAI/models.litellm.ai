import Fuse from "fuse.js";
import { describe, expect, it } from "vitest";
import {
  SEARCH_OPTIONS,
  indexModels,
  passesFilters,
  searchModels,
  type ModelFilters,
  type SearchableModel,
} from "./modelSearch";

const models: SearchableModel[] = [
  {
    name: "gamma/orbit-4o",
    display_name: "Orbit 4o",
    mode: "chat",
    litellm_provider: "gamma",
    max_input_tokens: 128000,
    max_output_tokens: 16384,
  },
  {
    name: "nova-sonnet-4",
    display_name: "Nova Sonnet 4",
    mode: "chat",
    litellm_provider: "alpha",
    max_input_tokens: 200000,
    max_output_tokens: 64000,
  },
  {
    name: "kappa/orbit-4o",
    display_name: "Orbit 4o",
    mode: "chat",
    litellm_provider: "kappa",
    max_input_tokens: "n/a",
    max_output_tokens: 4096,
  },
  {
    name: "delta/orbit-4o",
    display_name: "Orbit 4o",
    mode: "chat",
    litellm_provider: "delta",
    max_input_tokens: "128000",
    max_output_tokens: "16384",
  },
  {
    name: "orbit-4o-mini",
    display_name: "Orbit 4o mini",
    mode: "chat",
    litellm_provider: "alpha",
    max_input_tokens: 128000,
    max_output_tokens: 16384,
  },
  {
    name: "orbit-embed-large",
    display_name: "Orbit Embed Large",
    mode: "embedding",
    litellm_provider: "alpha",
    max_input_tokens: 8191,
  },
  {
    name: "orbit-image-3",
    display_name: "Orbit Image 3",
    mode: "image_generation",
    litellm_provider: "alpha",
  },
  {
    name: "delta/nova-sonnet-4",
    display_name: "Nova Sonnet 4",
    mode: "chat",
    litellm_provider: "delta",
    max_input_tokens: " 200000 ",
    max_output_tokens: 8192,
  },
  {
    name: "lumen-2.5-pro",
    display_name: "Lumen 2.5 Pro",
    mode: "chat",
    litellm_provider: "beta",
    max_input_tokens: 1048576,
    max_output_tokens: 65535,
  },
];

const noFilters: ModelFilters = {
  provider: "",
  minInputTokens: null,
  minOutputTokens: null,
};

const names = (items: readonly SearchableModel[]) =>
  items.map((item) => item.name);

const freshIndexSearch = (query: string, filters: ModelFilters) =>
  new Fuse(
    models.filter((item) => passesFilters(item, filters)),
    SEARCH_OPTIONS,
  )
    .search(query)
    .map((result) => result.item);

describe("searchModels without a query", () => {
  const index = indexModels(models);

  it("returns every model in catalog order when no filter is set", () => {
    expect(names(searchModels(index, "", noFilters))).toEqual(names(models));
  });

  it("keeps only the selected provider", () => {
    expect(
      names(searchModels(index, "", { ...noFilters, provider: "delta" })),
    ).toEqual(["delta/orbit-4o", "delta/nova-sonnet-4"]);
  });

  it("compares min input tokens against numbers and numeric strings", () => {
    expect(
      names(searchModels(index, "", { ...noFilters, minInputTokens: 150000 })),
    ).toEqual(["nova-sonnet-4", "delta/nova-sonnet-4", "lumen-2.5-pro"]);
  });

  it("drops models with a missing or non-numeric limit once a minimum of zero is set", () => {
    expect(
      names(searchModels(index, "", { ...noFilters, minInputTokens: 0 })),
    ).toEqual([
      "gamma/orbit-4o",
      "nova-sonnet-4",
      "delta/orbit-4o",
      "orbit-4o-mini",
      "orbit-embed-large",
      "delta/nova-sonnet-4",
      "lumen-2.5-pro",
    ]);
  });

  it("compares min output tokens independently of min input tokens", () => {
    expect(
      names(searchModels(index, "", { ...noFilters, minOutputTokens: 16384 })),
    ).toEqual([
      "gamma/orbit-4o",
      "nova-sonnet-4",
      "delta/orbit-4o",
      "orbit-4o-mini",
      "lumen-2.5-pro",
    ]);
  });

  it("requires every filter to pass", () => {
    expect(
      names(
        searchModels(index, "", {
          provider: "delta",
          minInputTokens: 150000,
          minOutputTokens: 8192,
        }),
      ),
    ).toEqual(["delta/nova-sonnet-4"]);
  });
});

describe("searchModels with a query", () => {
  const index = indexModels(models);

  const cases: [string, ModelFilters][] = [
    ["orbit", noFilters],
    ["orbit-4o", noFilters],
    ["orbit-4o", { ...noFilters, minInputTokens: 100000 }],
    ["orbit 4o", { ...noFilters, minOutputTokens: 10000 }],
    ["nova", { ...noFilters, provider: "delta" }],
    ["sonet", { ...noFilters, minInputTokens: 150000, minOutputTokens: 10000 }],
    ["alpha", noFilters],
    ["chat", { ...noFilters, minInputTokens: 0 }],
    ["embedding", { ...noFilters, provider: "beta" }],
  ];

  it.each(cases)(
    "returns what a fresh index over the filtered models returns for %j",
    (query, filters) => {
      const expected = freshIndexSearch(query, filters);
      expect(names(searchModels(index, query, filters))).toEqual(
        names(expected),
      );
    },
  );

  it("matches a fresh index as the filters change between searches", () => {
    const steps: [string, ModelFilters][] = [
      ["orbit", { ...noFilters, provider: "delta" }],
      ["orbit", { ...noFilters, provider: "alpha" }],
      ["orbit", { ...noFilters, provider: "alpha", minInputTokens: 100000 }],
      ["orbit", noFilters],
      ["", { ...noFilters, provider: "delta" }],
      ["orbit", { ...noFilters, provider: "delta" }],
    ];
    const switching = indexModels(models);
    for (const [query, filters] of steps) {
      const expected = query
        ? freshIndexSearch(query, filters)
        : models.filter((item) => passesFilters(item, filters));
      expect(names(searchModels(switching, query, filters))).toEqual(
        names(expected),
      );
    }
  });

  it("keeps tied models in catalog order after a filter removes one of them", () => {
    const scores = new Map(
      new Fuse(models, { ...SEARCH_OPTIONS, includeScore: true })
        .search("orbit-4o")
        .map((result) => [result.item.name, result.score]),
    );
    expect(scores.get("gamma/orbit-4o")).toBe(scores.get("delta/orbit-4o"));
    expect(scores.get("kappa/orbit-4o")).toBe(scores.get("delta/orbit-4o"));

    const filters = { ...noFilters, minInputTokens: 100000 };
    expect(names(searchModels(index, "orbit-4o", filters))).toEqual(
      names(freshIndexSearch("orbit-4o", filters)),
    );
  });
});
