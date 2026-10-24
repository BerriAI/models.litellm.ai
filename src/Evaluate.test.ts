// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Main from "./Main.svelte";
// Load compiled components before the mocked Svelte entry in the isolated runner.
import { tick } from "svelte";
import { PAGE_TITLES } from "./pageTitles";

vi.mock("svelte", () =>
  vi.importActual<typeof import("svelte")>("svelte/internal"),
);
vi.mock("./analytics", () => ({
  initAnalytics: vi.fn(),
  trackPageView: vi.fn(),
  trackTabChange: vi.fn(),
}));
vi.mock("./catalogData", () => ({
  loadCatalogData: vi.fn(async () => ({
    items: [],
    lines: [],
    metadata: Promise.resolve(new Map()),
    fetchedAt: 0,
  })),
}));

let app: Main;
const button = (label: string) =>
  Array.from(document.querySelectorAll("button")).find((b) =>
    b.textContent?.trim().startsWith(label),
  )!;
async function mount(path: string) {
  window.history.replaceState({}, "", path);
  app = new Main({ target: document.body });
  await tick();
}
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 503 })),
  );
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  app?.$destroy();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("navigates from Discover to Evaluate without exposing the demo workspace", async () => {
  await mount("/");
  expect(document.querySelector(".benchmarks")).toBeNull();
  expect(document.body.textContent).not.toContain("Evaluation workspace");
  const link = document.querySelector<HTMLAnchorElement>(
    'nav[aria-label="Main navigation"] a[href="/evaluate"]',
  )!;
  link.click();
  await tick();
  expect(window.location.pathname).toBe("/evaluate");
  expect(link.getAttribute("aria-current")).toBe("page");
  expect(document.title).toBe(PAGE_TITLES.evaluate);
  expect(document.querySelectorAll("figure ol > li")).toHaveLength(4);
  expect(document.querySelector(".charts")).toBeNull();
});

it("opens the command modal and copies a runnable setup command", async () => {
  await mount("/evaluate");
  const dialog = document.querySelector(
    "dialog[aria-labelledby=run-title]",
  ) as HTMLDialogElement;
  vi.spyOn(dialog, "showModal").mockImplementation(() =>
    dialog.setAttribute("open", ""),
  );
  const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  button("Run on your gateway traffic").click();
  expect(dialog.open).toBe(true);
  button("Copy command").click();
  await tick();
  expect(copy).toHaveBeenCalledWith(
    expect.stringMatching(
      /git clone https:\/\/github.com\/BerriAI\/models\.litellm\.ai\.git && cd models\.litellm\.ai && npm ci && npm run benchmark$/,
    ),
  );
  expect(document.querySelector('[role="status"]')?.textContent).toBe("Copied");
  expect(dialog.querySelector('a[href="/evaluate/sample"]')).not.toBeNull();
});

it("keeps a manual copy fallback when clipboard access fails", async () => {
  await mount("/evaluate");
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
    new Error("Clipboard unavailable"),
  );
  button("Copy command").click();
  await tick();
  expect(document.querySelector('[role="status"]')?.textContent).toBe(
    "Select and copy the command above",
  );
  expect(document.querySelector("dialog pre")?.textContent).toContain(
    "npm run benchmark",
  );
});

it("loads the sample directly, labels fictional data, and responds to history navigation", async () => {
  await mount("/evaluate/sample");
  expect(document.title).toBe(PAGE_TITLES["evaluate-sample"]);
  expect(
    document
      .querySelector('nav a[href="/evaluate"]')
      ?.getAttribute("aria-current"),
  ).toBe("page");
  expect(document.body.textContent).toContain(
    "All models, traffic, costs, and scores here are fictional.",
  );
  expect(document.querySelectorAll(".charts")).toHaveLength(1);
  expect(document.querySelector("details.benchmarks")).toBeNull();
  expect(
    document.querySelector('a[href="/evaluate"]')?.getAttribute("href"),
  ).toBe("/evaluate");
  button("Support answers").click();
  await tick();
  expect(document.body.textContent).toContain(
    "Use only the supplied support policy",
  );
  window.history.replaceState({}, "", "/evaluate");
  window.dispatchEvent(new PopStateEvent("popstate"));
  await tick();
  expect(document.title).toBe(PAGE_TITLES.evaluate);
  expect(document.querySelector(".charts")).toBeNull();
  expect(document.querySelector("#workflow-title")).not.toBeNull();
});
