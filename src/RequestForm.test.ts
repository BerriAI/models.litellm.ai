// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import RequestForm from "./RequestForm.svelte";
import { submitModelRequest } from "./modelRequest";

vi.mock("./modelRequest", () => ({ submitModelRequest: vi.fn() }));
vi.mock("./analytics", () => ({
  trackRequest: vi.fn(),
  trackRequestFormOpened: vi.fn(),
}));

let target: HTMLDivElement;
let component: RequestForm;

beforeEach(() => {
  window.history.replaceState(null, "", "/search?q=old-model");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  target = document.createElement("div");
  document.body.appendChild(target);
  component = new RequestForm({ target });
});

afterEach(() => {
  component.$destroy();
  target.remove();
  vi.clearAllMocks();
});

describe("model request form", () => {
  it("should render only a model-name field and honor an explicitly cleared query", async () => {
    await component.openModal("");
    const inputs = target.querySelectorAll("input");
    expect(inputs).toHaveLength(1);
    expect(inputs[0].id).toBe("requested-model");
    expect(inputs[0].value).toBe("");
    expect(
      target.querySelector("button[type=submit]")?.hasAttribute("disabled"),
    ).toBe(true);
  });

  it("should ignore a completed request from a previous dialog opening", async () => {
    let resolveRequest!: (delivery: "confirmed") => void;
    vi.mocked(submitModelRequest).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    await component.openModal("first-model");
    target
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await tick();
    expect(submitModelRequest).toHaveBeenCalledWith("first-model");

    (
      target.querySelector(
        '[aria-label="Close request form"]',
      ) as HTMLButtonElement
    ).click();
    await component.openModal("second-model");
    resolveRequest("confirmed");
    await Promise.resolve();
    await tick();

    expect(target.querySelector("input")?.value).toBe("second-model");
    expect(target.querySelector(".delivery-message")).toBeNull();
    expect(
      target.querySelector("button[type=submit]")?.hasAttribute("disabled"),
    ).toBe(false);
    expect(submitModelRequest).toHaveBeenCalledTimes(1);
  });
});
