export type RowRange = {
  readonly start: number;
  readonly end: number;
};

export function rowOffsets(heights: readonly number[]): number[] {
  const offsets = [0];
  for (const height of heights)
    offsets.push(offsets[offsets.length - 1] + height);
  return offsets;
}

function countWhere(
  offsets: readonly number[],
  isBefore: (offset: number) => boolean,
): number {
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (isBefore(offsets[mid])) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function rowsInView(
  offsets: readonly number[],
  top: number,
  bottom: number,
): RowRange {
  const rowCount = offsets.length - 1;
  const start = Math.min(
    rowCount,
    Math.max(0, countWhere(offsets, (offset) => offset <= top) - 1),
  );
  const end = Math.min(
    rowCount,
    countWhere(offsets, (offset) => offset < bottom),
  );
  return { start, end: Math.max(start, end) };
}

export function longestPerColumn(
  rows: readonly (readonly string[])[],
  columnCount: number,
): string[] {
  return Array.from({ length: columnCount }, (_, column) =>
    rows.reduce(
      (longest, cells) =>
        cells[column].length > longest.length ? cells[column] : longest,
      "",
    ),
  );
}
