import { createSearchHandler, type SearchMessage } from "./backgroundSearch";

const handle = createSearchHandler();

self.onmessage = (event: MessageEvent<SearchMessage>) => {
  const reply = handle(event.data);
  if (reply) self.postMessage(reply);
};
