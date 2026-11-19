// Generated model, provider and archive pages share the same chat as the SPA.
export {};

const triggers = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-ask-ai]"),
);
let chat: import("./AskAI.svelte").default | undefined;
let opening = false;
for (const trigger of triggers)
  trigger.addEventListener("click", async () => {
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
          triggers.forEach((button) =>
            button.setAttribute("aria-expanded", String(event.detail)),
          ),
        );
      }
      await chat.openPanel(trigger.dataset.aiPrefix);
    } finally {
      opening = false;
    }
  });
