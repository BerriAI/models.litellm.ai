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
    expect(document.body.textContent).toContain("All Providers");
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
        "All Providers",
        "bedrock_mantle",
      ]);
      expect(options[1].querySelector("img")?.getAttribute("src")).toBe(
        "/provider-logos/bedrock-color.svg",
      );
      options[1].click();
      await tick();
      expect(
        document.querySelector(".dropdown-trigger")?.textContent?.trim(),
      ).toBe("bedrock_mantle");
    },
  );
});
