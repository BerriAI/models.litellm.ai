import { describe, expect, test } from "vitest";
import { estimateSpend } from "./discoverDemo";

describe("monthly spend estimates", () => {
  test("should calculate savings when the candidate meets the quality floor", () => {
    const estimate = estimateSpend(0.12, 0.054, 99.1, 99, 200000);

    expect(estimate).toEqual({
      valid: true,
      current: 24000,
      candidate: 10800,
      difference: 13200,
      eligible: true,
    });
  });

  test("should mark a cheaper model below the quality floor as ineligible", () => {
    const estimate = estimateSpend(0.18, 0.078, 92.4, 96, 100000);

    expect(estimate.valid).toBe(true);
    expect(estimate.difference).toBe(10200);
    expect(estimate.eligible).toBe(false);
  });

  test("should accept a candidate exactly at the quality floor", () => {
    expect(estimateSpend(0.12, 0.1, 99, 99, 200000).eligible).toBe(true);
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "should reject an invalid monthly volume of %s",
    (volume) => {
      expect(estimateSpend(0.12, 0.054, 99.1, 99, volume)).toEqual({
        valid: false,
        current: 0,
        candidate: 0,
        difference: 0,
        eligible: false,
      });
    },
  );

  test.each([-1, 101, Number.NaN, Number.POSITIVE_INFINITY])(
    "should reject an invalid quality floor of %s",
    (floor) => {
      expect(estimateSpend(0.12, 0.054, 99.1, floor, 200000)).toEqual({
        valid: false,
        current: 0,
        candidate: 0,
        difference: 0,
        eligible: false,
      });
    },
  );

  test("should preserve a cost increase instead of reporting positive savings", () => {
    const estimate = estimateSpend(0.03, 0.07, 98.3, 97, 200000);

    expect(estimate.eligible).toBe(true);
    expect(estimate.current).toBe(6000);
    expect(estimate.candidate).toBeCloseTo(14000);
    expect(estimate.difference).toBeCloseTo(-8000);
  });
});
