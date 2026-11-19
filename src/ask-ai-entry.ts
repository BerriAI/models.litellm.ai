// Generated model, provider and archive pages share the same chat as the SPA.
export {};

const trigger = document.querySelector<HTMLButtonElement>("[data-ask-ai]");
let chat: import("./AskAI.svelte").default | undefined;
let opening = false;
trigger?.addEventListener("click", async () => {
  if (opening) return;
  opening = true;
  try {
    if (!chat) {
      const { default: AskAI } = await import("./AskAI.svelte");
      const target = document.createElement("div");
      document.body.append(target);
      const header = document.querySelector(".hf-header")!;
      const resize = () =>
        target.style.setProperty(
          "--ai-header-height",
          `${Math.max(0, header.getBoundingClientRect().bottom)}px`,
        );
      new ResizeObserver(resize).observe(header);
      window.addEventListener("scroll", resize, { passive: true });
      resize();
      chat = new AskAI({
        target,
        props: {
          trackEvent: (event, props) => window.litellmTrack?.(event, props),
        },
      });
      chat.$on("change", (event) =>
        trigger.setAttribute("aria-expanded", String(event.detail)),
      );
    }
    await chat.openPanel();
  } finally {
    opening = false;
  }
});
