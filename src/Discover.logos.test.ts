// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import Discover from "./Discover.svelte";
import { demoModels } from "./discoverDemo";
import { getProviderLogo } from "./providers";

let component: Discover;
afterEach(() => {
  component?.$destroy();
  document.body.innerHTML = "";
});

describe("Discover provider branding", () => {
  it("should render the shared provider artwork in charts and spend estimates", () => {
    component = new Discover({ target: document.body });
    const images = Array.from(document.getElementsByTagName("img"));
    for (const model of demoModels) {
      const logos = images.filter((image) => image.alt === model.providerName);
      expect(logos.length).toBeGreaterThanOrEqual(3);
      for (const logo of logos) {
        expect(logo.getAttribute("src")).toBe(getProviderLogo(model.provider));
      }
    }
  });
});
