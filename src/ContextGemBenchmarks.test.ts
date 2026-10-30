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
      ? Array.from(select.options).find((option) => option.value === value) ??
        null
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
    expect(document.querySelector(".experiment-line")?.textContent).toContain(
      "PDF extraction",
    );
    expect(document.querySelectorAll(".model-card")).toHaveLength(
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
    const failedRow = Array.from(document.querySelectorAll(".model-card")).find(
      (row) => row.getAttribute("aria-label") === source.model,
    )!;
    expect(failedRow.querySelector(".failed .failure-count")?.textContent).toBe(
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
    expect(document.querySelector(".experiment-line")?.textContent).toContain(
      "Data processing agreement",
    );
    expect(document.querySelector(".experiment-line")?.textContent).toContain(
      "Text extraction",
    );
    expect(document.querySelectorAll(".model-card")).toHaveLength(
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
    expect(document.querySelector(".experiment-line")?.textContent).toContain(
      "Microcontroller",
    );
  });

  it("separates decision model scopes and does not show missing references as zero", async () => {
    render();
    await change("Model type", "decision_default");
    expect(document.querySelectorAll(".model-card")).toHaveLength(
      contextGemRows("pdf", "complex_mcu", "decision_default").length,
    );
    expect(document.querySelector(".model-grid")?.textContent).toContain(
      "Closed concepts correct",
    );
    expect(document.querySelector(".model-grid")?.textContent).not.toContain(
      "Reference F1",
    );
    expect(document.querySelector(".model-grid")?.textContent).not.toContain(
      "Typed concepts correct",
    );
    expect(mean([null, null])).toBeNull();
    expect(mean([])).toBeNull();
    expect(mean([1, 0])).toBe(0.5);
  });

  it("keeps every document and model scope faithful to the published scores", async () => {
    render();
    for (const input of ["pdf", "text"] as const) {
      Array.from(document.querySelectorAll("button"))
        .find(
          (button) => button.textContent === contextGemSources[input].label,
        )!
        .click();
      await tick();
      for (const entry of contextGemSources[input].cases) {
        await change("Document", entry.id);
        for (const mode of ["default", "decision_default"] as const) {
          await change("Model type", mode);
          const expected = contextGemRows(input, entry.id, mode);
          const cards = Array.from(document.querySelectorAll(".model-card"));
          expect(cards, `${input}/${entry.id}/${mode}`).toHaveLength(
            expected.length,
          );
          for (const [index, result] of expected.entries()) {
            const card = cards[index];
            expect(card.getAttribute("aria-label")).toBe(result.model);
            expect(
              card.querySelector(".primary-metric strong")?.textContent,
            ).toBe(result.aspectF1?.toFixed(3) ?? "Not provided");
            expect(card.querySelector(".failure-count")?.textContent).toBe(
              `${result.failures} / ${result.runs}`,
            );
            expect(card.querySelector(".run-metrics")?.textContent).toContain(
              `$${result.cost?.toFixed(4)}`,
            );
            expect(
              card.querySelectorAll(".supporting-metrics > div"),
            ).toHaveLength(mode === "default" ? 2 : 1);
          }
        }
      }
    }
  });
});
