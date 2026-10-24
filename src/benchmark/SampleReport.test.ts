// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import SampleReport from "./SampleReport.svelte";

let component: SampleReport;
afterEach(() => {
  component?.$destroy();
  document.body.innerHTML = "";
});

it("uses gateway artwork for fictional models in the standalone sample", () => {
  component = new SampleReport({ target: document.body });
  const charts = Array.from(document.querySelectorAll(".chart-panel"));
  expect(charts).toHaveLength(3);
  for (const chart of charts) {
    const logos = Array.from(chart.querySelectorAll("img"));
    expect(logos).toHaveLength(3);
    for (const logo of logos) {
      expect(logo.alt).toBe("Gateway model");
      expect(logo.getAttribute("src")).toBe("/brand/litellm-monogram-blue-192.png");
    }
  }
  expect(document.body.textContent).toContain("fictional");
});
