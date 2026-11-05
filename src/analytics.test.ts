// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { MIXPANEL_OPTIONS } from "./analyticsConfig";

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("drops the static page id while preserving the visitor on entry to the app", async () => {
  vi.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(() => {});
  const token = "fake-analytics-test-token";
  vi.stubEnv("VITE_MIXPANEL_TOKEN", token);
  // Node 25's global localStorage can shadow happy-dom's storage in Vitest.
  vi.stubGlobal("localStorage", new Window().localStorage);
  // This is the persisted state left by mixpanelScript on a static model page.
  window.localStorage.setItem(
    `mp_${token}_mixpanel`,
    JSON.stringify({
      distinct_id: "test-visitor",
      $device_id: "test-device",
      surface: "static",
      page: "model",
      page_kind: "model",
      page_id: "example-model",
    }),
  );
  window.history.replaceState({}, "", "/");
  // Exercise real SDK persistence and event construction; transport is intercepted above.
  Object.assign(MIXPANEL_OPTIONS, {
    batch_requests: false,
    autocapture: false,
  });
  const { default: mixpanel } = await import("mixpanel-browser");
  const { initAnalytics, trackPageView, track } = await import("./analytics");
  initAnalytics();
  const capture = vi.spyOn(mixpanel, "track");
  trackPageView("models");
  track("Model Expanded", { model: "another-model" });

  const events = capture.mock.results.map((result) => result.value);
  expect(events.map(({ event }) => event)).toEqual([
    "Page View",
    "Model Expanded",
  ]);
  for (const { properties } of events) {
    expect(properties).toMatchObject({
      distinct_id: "test-visitor",
      surface: "app",
      page: "models",
      page_kind: "models",
    });
    expect(properties).not.toHaveProperty("page_id");
  }
  expect(
    JSON.parse(window.localStorage.getItem(`mp_${token}_mixpanel`)!),
  ).not.toHaveProperty("page_id");
});
