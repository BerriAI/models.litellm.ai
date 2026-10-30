// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import ContextGemBenchmarks from "./ContextGemBenchmarks.svelte";
import {
  CONTEXTGEM_FILES,
  contextGemRows,
  contextGemSources,
  mean,
} from "./contextgemBenchmarks";

let component: ContextGemBenchmarks;
afterEach(() => {
  component?.$destroy();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function render() {
  component = new ContextGemBenchmarks({ target: document.body });
}
function change(label: string, value: string) {
  const select = Array.from(document.querySelectorAll("label"))
    .find((element) => element.textContent?.trim().startsWith(label))!
    .querySelector("select")!;
  for (const option of Array.from(select.options)) {
    option.selected = option.value === value;
  }
  // happy-dom does not match selected options with :checked, which Svelte 4 uses.
  const querySelector = select.querySelector.bind(select);
  vi.spyOn(select, "querySelector").mockImplementation((selector: string) =>
    selector === ":checked"
      ? select.selectedOptions[0]
      : querySelector(selector),
  );
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return tick();
}

describe("ContextGem published extraction evals", () => {
  it("renders official branding and the PDF snapshot on first visit", () => {
    render();
    expect(document.querySelector("img")?.getAttribute("src")).toBe(
      "/contextgem/wordmark.svg",
    );
    expect(document.querySelector("caption")?.textContent).toContain(
      "PDF extraction",
    );
    expect(document.querySelectorAll("tbody tr")).toHaveLength(
      contextGemRows("pdf", "complex_mcu", "default").length,
    );
    expect(document.body.textContent).toContain("not human-verified");
    expect(document.body.textContent).toContain(
      "not independently rerun by LiteLLM",
    );
    expect(
      document.querySelector(
        `a[href="${CONTEXTGEM_FILES}/dev/evals/cases/complex_mcu.pdf"]`,
      ),
    ).not.toBeNull();
  });

  it("keeps failed trials in published means and displays their count", () => {
    render();
    const source = contextGemSources.pdf.rows.find(
      (row) => row.mode === "default" && row.errors.length,
    )!;
    const result = contextGemRows("pdf", source.case, "default").find(
      (row) => row.model === source.model,
    )!;
    expect(result.aspectF1).toBe(mean(source.aspect_f1));
    expect(result.runs).toBe(source.runs);
    const failedRow = Array.from(document.querySelectorAll("tbody tr")).find(
      (row) => row.textContent?.includes(source.model),
    )!;
    expect(failedRow.querySelector(".failed")?.textContent).toBe(
      `${source.errors.length} / ${source.runs}`,
    );
  });

  it("switches inputs and documents with matching evidence and no mixed experiment rows", async () => {
    render();
    const textButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Text extraction",
    )!;
    textButton.click();
    await tick();
    await change("Document", "complex_dpa");
    expect(document.querySelector("caption")?.textContent).toContain(
      "Data processing agreement",
    );
    expect(document.querySelector("caption")?.textContent).toContain(
      "Text extraction",
    );
    expect(document.querySelectorAll("tbody tr")).toHaveLength(
      contextGemRows("text", "complex_dpa", "default").length,
    );
    expect(
      document.querySelector(
        `a[href="${CONTEXTGEM_FILES}/dev/evals/cases/complex_dpa.txt"]`,
      ),
    ).not.toBeNull();
    expect(document.body.textContent?.replace(/\s+/g, " ")).toContain(
      "does not measure PDF parsing or OCR",
    );
    const pdfButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "PDF extraction",
    )!;
    pdfButton.click();
    await tick();
    expect(document.querySelector("caption")?.textContent).toContain(
      "Microcontroller",
    );
  });

  it("separates decision model scopes and does not show missing references as zero", async () => {
    render();
    await change("Model type", "decision_default");
    expect(document.querySelectorAll("tbody tr")).toHaveLength(
      contextGemRows("pdf", "complex_mcu", "decision_default").length,
    );
    expect(document.querySelector("thead")?.textContent).toContain(
      "Closed concepts correct",
    );
    expect(document.querySelector("thead")?.textContent).not.toContain(
      "Reference F1",
    );
    expect(document.querySelector("thead")?.textContent).not.toContain(
      "Typed concepts correct",
    );
    expect(mean([null, null])).toBeNull();
    expect(mean([])).toBeNull();
    expect(mean([1, 0])).toBe(0.5);
  });
});
