import Main from "./Main.svelte";

// The static copy of this route, for crawlers without JavaScript (scripts/seo/shell.ts); the app renders the same content.
document.getElementById("seo-shell")?.remove();

const app = new Main({
  target: document.getElementById("app")!,
});

export default app;
