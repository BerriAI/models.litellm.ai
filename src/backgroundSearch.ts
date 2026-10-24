import { hasZeroListedPrice } from "./searchIntent";

import {
  indexModels,
  passesFilters,
  searchCatalog,
  type CatalogMatches,
  type ModelFilters,
  type ModelIndex,
  type SearchableModel,
} from "./modelSearch";

type PositionedModel = SearchableModel & { position: number };

export type SearchMessage =
  | { type: "index"; models: PositionedModel[] }
  | { type: "search"; seq: number; query: string; filters: ModelFilters };

export type SearchReply = {
  seq: number;
  positions: number[];
  hiddenCount: number;
};

export type ModelSearcher<T> = {
  search(query: string, filters: ModelFilters): CatalogMatches<T> | null;
  receive(reply: SearchReply): void;
  workerFailed(): void;
};

const positioned = (
  item: SearchableModel,
  position: number,
): PositionedModel => ({
  name: item.name,
  display_name: item.display_name,
  mode: item.mode,
  litellm_provider: item.litellm_provider,
  max_input_tokens: item.max_input_tokens,
  max_output_tokens: item.max_output_tokens,
  supported_modalities: item.supported_modalities,
  supported_output_modalities: item.supported_output_modalities,
  supports_vision: item.supports_vision,
  supports_pdf_input: item.supports_pdf_input,
  supports_audio_input: item.supports_audio_input,
  supports_video_input: item.supports_video_input,
  supports_function_calling: item.supports_function_calling,
  zeroPriced: item.zeroPriced ?? hasZeroListedPrice(item),
  position,
});

export function createSearchHandler(): (
  message: SearchMessage,
) => SearchReply | null {
  let index: ModelIndex<PositionedModel> = indexModels([]);
  return (message) => {
    switch (message.type) {
      case "index":
        index = indexModels(message.models);
        return null;
      case "search": {
        const result = searchCatalog(index, message.query, message.filters);
        return {
          seq: message.seq,
          positions: result.items.map((model) => model.position),
          hiddenCount: result.hiddenCount,
        };
      }
    }
  };
}

export function createModelSearcher<T extends SearchableModel>(
  items: readonly T[],
  post: (message: SearchMessage) => void,
  show: (matches: CatalogMatches<T>) => void,
): ModelSearcher<T> {
  let latestSeq = 0;
  let waiting = false;
  let queued: SearchMessage | null = null;
  let unanswered: { query: string; filters: ModelFilters } | null = null;
  let pageIndex: ModelIndex<T> | null = null;

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
      if (!query) {
        queued = null;
        unanswered = null;
        const found = items.filter((item) => passesFilters(item, filters));
        return { items: found, hiddenCount: items.length - found.length };
      }
      if (pageIndex) return searchCatalog(pageIndex, query, filters);
      unanswered = { query, filters };
      send({ type: "search", seq: latestSeq, query, filters });
      return null;
    },
    receive(reply) {
      waiting = false;
      if (reply.seq === latestSeq && unanswered) {
        unanswered = null;
        show({
          items: reply.positions.map((position) => items[position]),
          hiddenCount: reply.hiddenCount,
        });
      }
      if (!queued) return;
      const next = queued;
      queued = null;
      send(next);
    },
    workerFailed() {
      if (pageIndex) return;
      pageIndex = indexModels(items);
      queued = null;
      if (!unanswered) return;
      const { query, filters } = unanswered;
      unanswered = null;
      show(searchCatalog(pageIndex, query, filters));
    },
  };
}
