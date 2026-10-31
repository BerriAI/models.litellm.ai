// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("svelte", () => vi.importActual<typeof import("svelte")>("svelte/internal"));
vi.mock("./analytics", () => ({ trackQuickStartCopy: vi.fn() }));
import QuickStartBox from "./QuickStartBox.svelte";
import { AGENT_PROMPTS, QUICKSTART } from "./quickstart";
import { trackQuickStartCopy } from "./analytics";
let component: QuickStartBox;
const writeText = vi.fn();
const button = (label: string) => Array.from(document.querySelectorAll("button")).find(b => b.textContent?.trim() === label)!;
beforeEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
  writeText.mockResolvedValue(undefined);
  vi.stubGlobal("navigator", {platform: "Win32", clipboard: {writeText}});
  component = new QuickStartBox({target: document.body});
});
afterEach(() => { component.$destroy(); vi.unstubAllGlobals(); });
it("detects Windows and copies its command, then the full gateway prompt", async () => {
  await vi.waitFor(() => expect(document.querySelector("pre")?.textContent).toBe(QUICKSTART.gateway.windows));
  button("Copy").click();
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(QUICKSTART.gateway.windows));
  button("Copy agent prompt").click();
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(AGENT_PROMPTS.gateway));
  expect(trackQuickStartCopy).toHaveBeenCalledWith("gateway", "prompt", undefined);
});
it("switches to the Python SDK with its own command and prompt", async () => {
  button("SDK").click();
  await vi.waitFor(() => expect(document.querySelector("pre")?.textContent).toBe(QUICKSTART.sdk));
  button("Copy agent prompt").click();
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(AGENT_PROMPTS.sdk));
  expect(document.body.textContent).toContain("Python project");
});
it("exposes the full selectable prompt on clipboard failure and allows retry", async () => {
  writeText.mockRejectedValueOnce(new Error("Permission denied"));
  button("Copy agent prompt").click();
  await vi.waitFor(() => expect(document.querySelector("textarea")?.value).toBe(AGENT_PROMPTS.gateway));
  expect(document.querySelector('[role="status"]')?.textContent).toContain("Select and copy");
  expect(trackQuickStartCopy).not.toHaveBeenCalled();
  button("Copy agent prompt").click();
  await vi.waitFor(() => expect(document.querySelector("textarea")).toBeNull());
  expect(trackQuickStartCopy).toHaveBeenCalledTimes(1);
});
