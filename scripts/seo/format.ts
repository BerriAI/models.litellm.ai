const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** `$4.00`, `$0.0336`, `$0.000125`: two decimals minimum, more only when the value needs them. */
export function usd(n: number): string {
  if (n === 0) return "$0";
  // Four significant digits absorbs float noise like 3.9999999999999996 and
  // DBU-converted prices like 4.00001, and covers every list price we've seen.
  const [whole, frac = ""] = Number(n.toPrecision(4)).toFixed(10).replace(/0+$/, "").split(".");
  return `$${Number(whole).toLocaleString("en-US")}.${frac.padEnd(2, "0")}`;
}

/** Like `usd` but drops `.00` on whole numbers, for titles: `$4`, `$1.50`. */
export function usdShort(n: number): string {
  const s = usd(n);
  return s.endsWith(".00") ? s.slice(0, -3) : s;
}

export function int(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** `131072` -> `128K`, `200000` -> `200K`, `1048576` -> `1M`. */
export function tokensShort(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    const near = Math.round(m);
    return `${Math.abs(m - near) < 0.06 ? near : Number(m.toFixed(1))}M`;
  }
  if (n >= 1000) return `${n % 1000 === 0 ? n / 1000 : n % 1024 === 0 ? n / 1024 : Math.round(n / 1000)}K`;
  return String(n);
}

/** "a" or "an" before a number as it is spoken: an 8,191-token window, an 11K budget. */
export function article(formatted: string): string {
  const lead = formatted.replace(/^\$/, "").split(/[,.]/)[0];
  return /^8/.test(lead) || lead === "11" || lead === "18" ? "an" : "a";
}

/** `2026-10-06` -> `October 6, 2026`. */
export function longDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m) return iso;
  return d ? `${MONTHS_LONG[m - 1]} ${d}, ${y}` : `${MONTHS_LONG[m - 1]} ${y}`;
}

/** `2026-10-06` -> `Oct 6, 2026`. */
export function shortDate(iso: string): string {
  return longDate(iso).replace(/^(\w{3})\w*/, "$1");
}

/** `2026-10-06` -> `Oct 2026`. */
export function monthYear(iso: string): string {
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  return `${MONTHS_LONG[m - 1].slice(0, 3)} ${y}`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function unescapeHtml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Join names as prose: `A`, `A and B`, `A, B and C`. */
export function listProse(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
