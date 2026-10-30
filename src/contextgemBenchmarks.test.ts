import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import summary from "../public/contextgem/litellm_2026-10-30_pdf/summary.json";
import manifest from "../public/contextgem/litellm_2026-10-30_pdf/manifest.json";
import { contextGemRows, contextGemLiteLLMRun } from "./contextgemBenchmarks";

type Run = {
  case: string;
  model: string;
  input: string;
  mode: string;
  run: number;
  error: string | null;
  seconds: number;
  usage: { cost_total: string };
  provenance: typeof manifest.provenance;
  scores: {
    summary: {
      aspect_f1: number;
      reference_f1: number;
      n_concepts_correct: number;
      n_concepts_scored: number;
    };
  };
};

describe("independent ContextGem PDF evidence", () => {
  it("matches every reported run to its shipped extraction output and scorer result", () => {
    expect(summary).toHaveLength(
      manifest.models.length * manifest.cases.length,
    );
    for (const configuration of summary) {
      const result = contextGemRows("pdf", configuration.case, "default").find(
        (row) =>
          row.model === configuration.model && row.publisher === "LiteLLM",
      )!;
      expect(result.date).toBe(manifest.date);
      const runs: Run[] = JSON.parse(
        readFileSync(
          new URL(`../public${result.evidenceUrl}`, import.meta.url),
          "utf8",
        ),
      );
      expect(runs.map((run) => run.run)).toEqual([1, 2, 3]);
      expect(runs).toHaveLength(configuration.runs);
      for (const run of runs) {
        expect(run.case).toBe(configuration.case);
        expect(run.model).toBe(configuration.model);
        expect(run.input).toBe("pdf");
        expect(run.mode).toBe("default");
        expect(run.provenance).toEqual(manifest.provenance);
        expect(run.scores.summary.n_concepts_scored).toBe(
          configuration.n_concepts_scored,
        );
      }
      expect(configuration.aspect_f1).toEqual(
        runs.map((run) => run.scores.summary.aspect_f1),
      );
      expect(configuration.reference_f1).toEqual(
        runs.map((run) => run.scores.summary.reference_f1),
      );
      expect(configuration.concepts_correct).toEqual(
        runs.map((run) => run.scores.summary.n_concepts_correct),
      );
      expect(configuration.seconds).toEqual(runs.map((run) => run.seconds));
      expect(configuration.cost_total).toEqual(
        runs.map((run) => run.usage.cost_total),
      );
      expect(result.failures).toBe(
        runs.filter((run) => run.error !== null).length,
      );
      expect(result.runs).toBe(manifest.runs_per_configuration);
    }
  });

  it("never reuses independent PDF results in text or decision scopes", () => {
    for (const entry of manifest.cases) {
      expect(
        contextGemRows("text", entry, "default").some(
          (row) => row.publisher === "LiteLLM",
        ),
      ).toBe(false);
      expect(
        contextGemRows("pdf", entry, "decision_default").some(
          (row) => row.publisher === "LiteLLM",
        ),
      ).toBe(false);
    }
    expect(contextGemLiteLLMRun.input).toBe("pdf");
  });
});
