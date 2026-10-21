import {
  indexModels,
  passesFilters,
  searchModels,
  type ModelFilters,
  type ModelIndex,
  type SearchableModel,
} from "./modelSearch";

type PositionedModel = SearchableModel & { position: number };

export type SearchMessage =
  | { type: "index"; models: PositionedModel[] }
  | { type: "search"; seq: number; query: string; filters: ModelFilters };

export type SearchReply = { seq: number; positions: number[] };

export type ModelSearcher<T> = {
  search(query: string, filters: ModelFilters): T[] | null;
  receive(reply: SearchReply): void;
};

const positioned = (item: SearchableModel, position: number): PositionedModel => ({
  name: item.name,
  display_name: item.display_name,
  mode: item.mode,
  litellm_provider: item.litellm_provider,
  max_input_tokens: item.max_input_tokens,
  max_output_tokens: item.max_output_tokens,
  position,
});

export function createSearchHandler(): (message: SearchMessage) => SearchReply | null {
  let index: ModelIndex<PositionedModel> = indexModels([]);
  return (message) => {
    switch (message.type) {
      case "index":
        index = indexModels(message.models);
        return null;
      case "search":
        return {
          seq: message.seq,
          positions: searchModels(index, message.query, message.filters).map((model) => model.position),
        };
    }
  };
}

export function createModelSearcher<T extends SearchableModel>(
  items: readonly T[],
  post: (message: SearchMessage) => void,
  show: (matches: T[]) => void,
): ModelSearcher<T> {
  let latestSeq = 0;
  let waiting = false;
  let queued: SearchMessage | null = null;

  const send = (message: SearchMessage) => {
    if (waiting) {
      queued = message;
      return;
    }
    waiting = true;
    post(message);
  };

  post({ type: "index", models: items.map(positioned) });

  return {
    search(query, filters) {
      latestSeq += 1;
      if (query) {
        send({ type: "search", seq: latestSeq, query, filters });
        return null;
      }
      queued = null;
      return items.filter((item) => passesFilters(item, filters));
    },
    receive(reply) {
      waiting = false;
      if (reply.seq === latestSeq) show(reply.positions.map((position) => items[position]));
      if (!queued) return;
      const next = queued;
      queued = null;
      send(next);
    },
  };
}
