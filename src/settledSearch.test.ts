import { afterEach, describe, expect, it, vi } from "vitest";
import { createSettledSearch, type SettledSearch } from "./settledSearch";

const result = (query: string, count: number): SettledSearch => ({
  query,
  resultsCount: count,
  hiddenCount: 3,
  filters: {
    provider: "anthropic",
    minInputTokens: 1000,
    minOutputTokens: null,
    freeOnly: true,
    output: "text",
    inputs: ["image"],
    toolsOnly: true,
  },
});
afterEach(() => vi.useRealTimers());

describe("settled search analytics", () => {
  it("should emit only the settled query with its final count and filter dimensions", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const analytics = createSettledSearch(emit);
    analytics.settle(analytics.begin(), result("c", 40));
    vi.advanceTimersByTime(200);
    analytics.settle(analytics.begin(), result("cl", 20));
    vi.advanceTimersByTime(200);
    const final = result("claude", 2);
    analytics.settle(analytics.begin(), final);
    vi.advanceTimersByTime(750);
    expect(emit).toHaveBeenCalledExactlyOnceWith(final);
  });

  it("should wait for the current worker result when Enter is pressed", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const analytics = createSettledSearch(emit);
    const old = analytics.begin();
    const current = analytics.begin();
    analytics.enter();
    analytics.settle(old, result("c", 100));
    expect(emit).not.toHaveBeenCalled();
    analytics.settle(current, result("claude", 2));
    expect(emit).toHaveBeenCalledExactlyOnceWith(result("claude", 2));
    vi.advanceTimersByTime(1000);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("should cancel pending telemetry on navigation or cleared search", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const analytics = createSettledSearch(emit);
    const revision = analytics.begin();
    analytics.settle(revision, result("claude", 2));
    analytics.cancel();
    analytics.settle(revision, result("claude", 9));
    vi.advanceTimersByTime(1000);
    analytics.settle(analytics.begin(), result("", 100));
    vi.advanceTimersByTime(1000);
    expect(emit).not.toHaveBeenCalled();
  });
});
