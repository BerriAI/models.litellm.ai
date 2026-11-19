// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { Window } from "happy-dom";

const mixpanel = vi.hoisted(() => ({
  __SV: 1,
  init: vi.fn(),
  unregister: vi.fn(),
  register: vi.fn(),
  time_event: vi.fn(),
  track: vi.fn(),
}));
vi.mock("mixpanel-browser", () => ({ default: mixpanel }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const links = `<a href="https://example.com/docs">Public documentation</a>
  <aside data-ai-chat class="ph-no-capture" data-mp-no-capture>
    <p>A private question and answer.</p>
    <a href="https://example.com/citation"><span>Private answer text</span></a>
    <a href="https://example.com/source">Source from this conversation</a>
    <a href="/models">Same-site model link</a>
  </aside>`;

function expectEvents(calls: unknown[][]) {
  const outbound = calls.filter(([event]) => event === "Outbound Link Clicked");
  expect(outbound).toEqual([
    [
      "Outbound Link Clicked",
      {
        url: "https://example.com/docs",
        host: "example.com",
        text: "Public documentation",
      },
      { transport: "sendBeacon" },
    ],
    [
      "Outbound Link Clicked",
      { url: "https://example.com/citation", host: "example.com" },
      { transport: "sendBeacon" },
    ],
    [
      "Outbound Link Clicked",
      { url: "https://example.com/source", host: "example.com" },
      { transport: "sendBeacon" },
    ],
  ]);
  expect(JSON.stringify(outbound)).not.toMatch(
    /Private answer|private question|this conversation/,
  );
}

it("tracks chat source and nested citation clicks in the app without capturing chat text", async () => {
  vi.stubEnv("VITE_MIXPANEL_TOKEN", "fake-analytics-test-token");
  const { initAnalytics } = await import("./analytics");
  initAnalytics();
  document.body.innerHTML = links;
  document.body.addEventListener("click", (event) => event.preventDefault(), {
    once: false,
  });
  for (const anchor of document.querySelectorAll("a")) {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    event.preventDefault();
    (anchor.querySelector("span") || anchor).dispatchEvent(event);
  }
  expectEvents(mixpanel.track.mock.calls);
});

it("tracks the same destinations from the generated-page handler without capturing chat text", async () => {
  vi.stubEnv("VITE_MIXPANEL_TOKEN", "fake-analytics-test-token");
  const { mixpanelScript } = await import("../scripts/seo/html");
  const page = new Window({ url: "https://models.litellm.ai/models/example" });
  // The SDK bootstrap sees the existing instance and does not load any network script.
  Object.assign(page, { mixpanel });
  try {
    const script = mixpanelScript("/models/example");
    page.eval(script.slice("<script>".length, -"</script>".length));
    page.document.body.innerHTML = links;
    page.document.body.addEventListener("click", (event) =>
      event.preventDefault(),
    );
    for (const anchor of page.document.querySelectorAll("a")) {
      const event = new page.MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      event.preventDefault();
      (anchor.querySelector("span") || anchor).dispatchEvent(event);
    }
    expectEvents(mixpanel.track.mock.calls);
  } finally {
    await page.happyDOM.close();
  }
});
