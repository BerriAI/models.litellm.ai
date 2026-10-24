import type { ModelFilters } from "./modelSearch";

export type SettledSearch = {
  query: string;
  filters: ModelFilters;
  resultsCount: number;
  hiddenCount: number;
};

/** Track a completed search once, after typing pauses or Enter is pressed. */
export function createSettledSearch(
  emit: (search: SettledSearch) => void,
  delay = 750,
) {
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: SettledSearch | null = null;
  let entered = false;
  let emittedKey = "";

  function flush() {
    clearTimeout(timer);
    if (!pending?.query.trim()) return;
    const key = JSON.stringify(pending);
    if (key !== emittedKey) {
      emittedKey = key;
      emit(pending);
    }
    pending = null;
  }

  return {
    begin() {
      clearTimeout(timer);
      pending = null;
      entered = false;
      return ++revision;
    },
    settle(searchRevision: number, search: SettledSearch) {
      if (searchRevision !== revision) return;
      pending = search;
      clearTimeout(timer);
      if (entered) flush();
      else timer = setTimeout(flush, delay);
    },
    enter() {
      entered = true;
      flush();
    },
    cancel() {
      revision += 1;
      clearTimeout(timer);
      pending = null;
      entered = false;
    },
  };
}
