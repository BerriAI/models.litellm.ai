import baseline from "../public/contextgem/baseline-summary.json";
import pdf from "../public/contextgem/pdf-summary.json";
import litellmPdf from "../public/contextgem/litellm_2026-10-30_pdf/summary.json";
import litellmManifest from "../public/contextgem/litellm_2026-10-30_pdf/manifest.json";

export const contextGemLiteLLMRun = {
  date: litellmManifest.date,
  input: litellmManifest.input,
  root: `/contextgem/${litellmManifest.label}`,
};

export const CONTEXTGEM_REF = "c4810412cdb6648c38d114d152711a18a989c7ea";
export const CONTEXTGEM_ROOT = `https://github.com/shcherbak-ai/contextgem/tree/${CONTEXTGEM_REF}`;
export const CONTEXTGEM_FILES = `https://github.com/shcherbak-ai/contextgem/blob/${CONTEXTGEM_REF}`;

export const contextGemSources = {
  pdf: {
    label: "PDF extraction",
    experiment: "pdf_2026-10-21_pdf",
    date: "2026-10-21",
    rows: pdf,
    cases: [
      { id: "complex_mcu", name: "Microcontroller technical report" },
      { id: "complex_stability", name: "Tablet stability study" },
    ],
  },
  text: {
    label: "Text extraction",
    experiment: "baseline_2026-10-23",
    date: "2026-10-23",
    rows: baseline,
    cases: [
      { id: "complex_nda", name: "Non-disclosure agreement" },
      { id: "complex_dpa", name: "Data processing agreement" },
      { id: "complex_mcu", name: "Microcontroller technical report" },
      { id: "complex_stability", name: "Tablet stability study" },
    ],
  },
};

export type ContextGemInput = keyof typeof contextGemSources;
export type ContextGemMode = "default" | "decision_default";

export function mean(values: readonly (number | null)[]): number | null {
  if (!values.length || values.some((value) => value === null)) return null;
  return (
    values.reduce<number>((total, value) => total + (value ?? 0), 0) /
    values.length
  );
}

export function contextGemRows(
  input: ContextGemInput,
  document: string,
  mode: ContextGemMode,
) {
  const source = contextGemSources[input];
  const upstream = source.rows.map((row) => ({
    ...row,
    publisher: "ContextGem" as const,
    date: source.date,
    evidenceUrl: `${CONTEXTGEM_ROOT}/dev/evals/results/${source.experiment}/runs`,
  }));
  const independent =
    input === contextGemLiteLLMRun.input
      ? litellmPdf.map((row) => ({
          ...row,
          publisher: "LiteLLM" as const,
          date: contextGemLiteLLMRun.date,
          evidenceUrl: `${contextGemLiteLLMRun.root}/${row.case}__${row.model.replace(/[^A-Za-z0-9.-]+/g, "_")}.json`,
        }))
      : [];
  return [...upstream, ...independent]
    .filter((row) => row.case === document && row.mode === mode)
    .map((row) => ({
      model: row.model,
      publisher: row.publisher,
      date: row.date,
      evidenceUrl: row.evidenceUrl,
      runs: row.runs,
      aspectF1: mean(row.aspect_f1),
      referenceF1: mean(row.reference_f1),
      concepts: mean(row.concepts_correct),
      totalConcepts: row.n_concepts_scored,
      closedConcepts: mean(row.closed_concepts_correct),
      totalClosedConcepts: row.n_closed_concepts,
      seconds: mean(row.seconds),
      cost: mean(row.cost_total.map(Number)),
      failures: row.errors.length,
    }));
}
