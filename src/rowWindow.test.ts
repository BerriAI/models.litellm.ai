import { describe, expect, it } from "vitest";
import { longestPerColumn, rowOffsets, rowsInView } from "./rowWindow";

describe("rowsInView", () => {
  const offsets = rowOffsets([64, 64, 300, 64, 64]);

  it("ends at the total height of every row", () => {
    expect(offsets[offsets.length - 1]).toBe(556);
  });

  it("returns the rows that overlap the view, including a tall one", () => {
    expect(rowsInView(offsets, 100, 200)).toEqual({ start: 1, end: 3 });
  });

  it("leaves out rows that only touch the edges of the view", () => {
    expect(rowsInView(offsets, 128, 428)).toEqual({ start: 2, end: 3 });
  });

  it("returns every row when the view covers the whole list", () => {
    expect(rowsInView(offsets, -1000, 5000)).toEqual({ start: 0, end: 5 });
  });

  it("returns no rows for a view above or below the list", () => {
    expect(rowsInView(offsets, -500, -10)).toEqual({ start: 0, end: 0 });
    expect(rowsInView(offsets, 600, 900)).toEqual({ start: 5, end: 5 });
  });

  it("returns no rows for an empty list", () => {
    expect(rowsInView(rowOffsets([]), 0, 900)).toEqual({ start: 0, end: 0 });
  });
});

describe("longestPerColumn", () => {
  it("picks the longest text in each column, keeping the first on a tie", () => {
    const rows = [
      ["Jan 2025", "128K", "$0.15/M"],
      ["Sep 2024", "1M", "$0.0000277778/s"],
      ["-", "200K", "$10.00/M"],
    ];
    expect(longestPerColumn(rows, 3)).toEqual([
      "Jan 2025",
      "128K",
      "$0.0000277778/s",
    ]);
  });

  it("returns empty texts when there are no rows", () => {
    expect(longestPerColumn([], 2)).toEqual(["", ""]);
  });
});
