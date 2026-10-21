/**
 * Checks that a built model page's prose agrees with its own price table. The
 * prose is generated from the same rows, so a mismatch means a bug, and search
 * engines and AI answers quote the prose.
 */

const OTHER_PRICE_COLS = [
  "Per image",
  "Per second",
  "Per minute",
  "Per 1M chars",
  "Per 1K queries",
  "Per 1K pages",
];

const money = (s: string) => Number(s.replace(/[$,]/g, ""));
const strip = (s: string) => s.replace(/<[^>]+>/g, "").trim();

/** Returns a description of the mismatch, or null when the page agrees with itself or quotes no range. */
export function rangeMismatch(html: string): string | null {
  const said =
    /the (input )?price ranges from (\$[\d,]+(?:\.\d+)?) to (\$[\d,]+(?:\.\d+)?)/.exec(
      html,
    );
  if (!said) return null;
  const section = /<section id="pricing">([\s\S]*?)<\/section>/.exec(html)?.[1];
  if (!section) return "quotes a price range but has no pricing table";
  const head = /<thead>([\s\S]*?)<\/thead>/.exec(section)?.[1] ?? "";
  const labels = [...head.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    strip(m[1]),
  );
  const col = said[1]
    ? labels.indexOf("Input")
    : labels.findIndex((l) => OTHER_PRICE_COLS.includes(l));
  if (col < 0)
    return "quotes a price range but the table has no matching price column";
  const values: number[] = [];
  for (const body of section.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)) {
    for (const row of body[1].matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g)) {
      if (row[1].includes("data-fine-tuned")) continue;
      if (row[2].includes('class="flag"')) continue; // outliers are marked and kept out of the range
      const cell = [...row[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)][col];
      const text = cell ? strip(cell[1]) : "";
      if (text.startsWith("$")) values.push(money(text));
    }
  }
  if (!values.length)
    return "quotes a price range but the table has no prices in that column";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const close = (a: number, b: number) =>
    Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 0.005);
  if (close(money(said[2]), min) && close(money(said[3]), max)) return null;
  return `prose says ${said[2]} to ${said[3]}, table shows $${min} to $${max}`;
}
