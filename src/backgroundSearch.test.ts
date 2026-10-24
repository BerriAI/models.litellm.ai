import { describe, expect, it } from "vitest";
import {
  createModelSearcher,
  createSearchHandler,
  type SearchMessage,
} from "./backgroundSearch";
import {
  indexModels,
  searchModels,
  type ModelFilters,
  type SearchableModel,
} from "./modelSearch";

type CatalogModel = SearchableModel & { input_cost_per_token?: number };

const models: CatalogModel[] = [
  {
    name: "gamma/orbit-4o",
    display_name: "Orbit 4o",
    mode: "chat",
    litellm_provider: "gamma",
    max_input_tokens: 128000,
    max_output_tokens: 16384,
    input_cost_per_token: 2e-6,
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

function connectWorker() {
  const handle = createSearchHandler();
  const outbox: SearchMessage[] = [];
  const shown: CatalogModel[][] = [];
  const searcher = createModelSearcher(
    models,
    (message) => outbox.push(message),
    (found) => shown.push(found.items),
  );
  const deliverNext = () => {
    const message = outbox.shift();
    if (!message) throw new Error("the page posted nothing to the worker");
    const reply = handle(message);
    if (reply) searcher.receive(reply);
  };
  deliverNext();
  const postedQueries = () =>
    outbox.flatMap((message) =>
      message.type === "search" ? [message.query] : [],
    );
  return { searcher, outbox, shown, deliverNext, postedQueries };
}

describe("searching through the worker", () => {
  const direct = indexModels(models);
  const cases: [string, ModelFilters][] = [
    ["orbit", noFilters],
    ["orbit-4o", noFilters],
    ["orbit-4o", { ...noFilters, minInputTokens: 100000 }],
    ["orbit 4o", { ...noFilters, minOutputTokens: 10000 }],
    ["nova", { ...noFilters, provider: "delta" }],
    ["sonet", { ...noFilters, minInputTokens: 150000, minOutputTokens: 10000 }],
    ["alpha", noFilters],
    ["chat", { ...noFilters, minInputTokens: 0 }],
    ["embedding", noFilters],
  ];

  it.each(cases)(
    "shows what a search on the page itself would show for %j",
    (query, filters) => {
      const worker = connectWorker();
      expect(worker.searcher.search(query, filters)).toBeNull();
      worker.deliverNext();
      expect(worker.shown).toHaveLength(1);
      expect(worker.shown[0]).toEqual(searchModels(direct, query, filters));
    },
  );

  it("filters an empty query on the page without waiting for the worker", () => {
    const worker = connectWorker();
    const filters = { ...noFilters, provider: "delta", minInputTokens: 150000 };
    expect(names(worker.searcher.search("", filters)?.items ?? [])).toEqual(
      names(searchModels(direct, "", filters)),
    );
    expect(worker.outbox).toEqual([]);
  });

  it("drops a reply that arrives after the search box was cleared", () => {
    const worker = connectWorker();
    worker.searcher.search("orbit", noFilters);
    expect(names(worker.searcher.search("", noFilters)?.items ?? [])).toEqual(
      names(models),
    );
    worker.deliverNext();
    expect(worker.shown).toEqual([]);
    expect(worker.outbox).toEqual([]);
  });

  it("sends only the newest query once the worker finishes the one it is on", () => {
    const worker = connectWorker();
    worker.searcher.search("o", noFilters);
    worker.searcher.search("or", noFilters);
    worker.searcher.search("orbit-4o", noFilters);
    expect(worker.postedQueries()).toEqual(["o"]);
    worker.deliverNext();
    expect(worker.shown).toEqual([]);
    expect(worker.postedQueries()).toEqual(["orbit-4o"]);
    worker.deliverNext();
    expect(worker.shown.map(names)).toEqual([
      names(searchModels(direct, "orbit-4o", noFilters)),
    ]);
  });

  it("drops the queued query when the search box is cleared", () => {
    const worker = connectWorker();
    worker.searcher.search("o", noFilters);
    worker.searcher.search("orbit", noFilters);
    worker.searcher.search("", noFilters);
    worker.deliverNext();
    expect(worker.shown).toEqual([]);
    expect(worker.outbox).toEqual([]);
    worker.searcher.search("nova", noFilters);
    worker.deliverNext();
    expect(worker.shown.map(names)).toEqual([
      names(searchModels(direct, "nova", noFilters)),
    ]);
  });

  it("searches on the page once the worker fails, starting with the query it never answered", () => {
    const worker = connectWorker();
    const filters = { ...noFilters, provider: "delta" };
    worker.searcher.search("orbit", noFilters);
    worker.searcher.search("nova", filters);
    worker.searcher.workerFailed();
    expect(worker.shown.map(names)).toEqual([
      names(searchModels(direct, "nova", filters)),
    ]);
    expect(
      names(worker.searcher.search("orbit-4o", noFilters)?.items ?? []),
    ).toEqual(names(searchModels(direct, "orbit-4o", noFilters)));
    worker.deliverNext();
    expect(worker.shown).toHaveLength(1);
    expect(worker.outbox).toEqual([]);
  });

  it("ignores the answer a failed worker sends late", () => {
    const worker = connectWorker();
    worker.searcher.search("orbit", noFilters);
    worker.searcher.workerFailed();
    worker.deliverNext();
    expect(worker.shown.map(names)).toEqual([
      names(searchModels(direct, "orbit", noFilters)),
    ]);
  });
});
