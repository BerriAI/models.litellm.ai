// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { tick } from "svelte";
import ProviderDropdown from "./ProviderDropdown.svelte";

let dropdown: ProviderDropdown;
afterEach(() => {
  dropdown?.$destroy();
  document.body.innerHTML = "";
});

describe("provider dropdown", () => {
  it("should render the provider picker", () => {
    dropdown = new ProviderDropdown({ target: document.body });
    expect(document.body.textContent).toContain("All providers");
  });

  it.each(["bedrock mantle", "bedrock_mantle", "  BEDROCK   MANTLE  "])(
    "should find and select Mantle with the query %s while preserving its provider ID",
    async (query) => {
      dropdown = new ProviderDropdown({
        target: document.body,
        props: { providers: ["bedrock", "bedrock_converse", "bedrock_mantle"] },
      });
      document.querySelector<HTMLButtonElement>("button")!.click();
      await tick();
      const input = document.querySelector<HTMLInputElement>("input")!;
      input.value = query;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await tick();

      const options = [
        ...document.querySelectorAll<HTMLButtonElement>(".dropdown-option"),
      ];
      expect(options.map((option) => option.textContent?.trim())).toEqual([
        "All providers",
        "Bedrock Mantle",
      ]);
      expect(options[1].querySelector("img")?.getAttribute("src")).toBe(
        "/provider-logos/bedrock-color.svg",
      );
      options[1].click();
      await tick();
      expect(
        document.querySelector(".dropdown-trigger")?.textContent?.trim(),
      ).toBe("Bedrock Mantle");
      expect(document.activeElement).toBe(
        document.querySelector(".dropdown-trigger"),
      );
    },
  );

  it("should search display names and select the first match with Enter", async () => {
    dropdown = new ProviderDropdown({
      target: document.body,
      props: { providers: ["bedrock", "bedrock_mantle"] },
    });
    document.querySelector<HTMLButtonElement>("button")!.click();
    await tick();
    const input = document.querySelector<HTMLInputElement>("input")!;
    expect(document.activeElement).toBe(input);
    input.value = "Amazon";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(2);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await tick();
    expect(document.querySelector(".dropdown-trigger")?.textContent).toContain(
      "Amazon Bedrock",
    );
  });

  it("should dismiss with Escape without changing the selection", async () => {
    dropdown = new ProviderDropdown({
      target: document.body,
      props: {
        providers: ["bedrock_mantle"],
        selectedProvider: "bedrock_mantle",
      },
    });
    const trigger = document.querySelector<HTMLButtonElement>("button")!;
    trigger.click();
    await tick();
    document
      .querySelector("input")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    await tick();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.textContent).toContain("Bedrock Mantle");
    expect(document.activeElement).toBe(trigger);
  });

  it("should keep the current selection when Enter is pressed with no matches", async () => {
    dropdown = new ProviderDropdown({
      target: document.body,
      props: {
        providers: ["bedrock_mantle"],
        selectedProvider: "bedrock_mantle",
      },
    });
    document.querySelector<HTMLButtonElement>("button")!.click();
    await tick();
    const input = document.querySelector<HTMLInputElement>("input")!;
    input.value = "missing provider";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await tick();
    expect(document.body.textContent).toContain("No matching providers");
    expect(document.querySelector(".dropdown-trigger")?.textContent).toContain(
      "Bedrock Mantle",
    );
  });
});
