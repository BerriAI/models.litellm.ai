/** Discard the legacy search-schema placeholder without rewriting model IDs. */
export function sanitizeSearchQuery(value: string | null | undefined): string {
  const query = value?.trim() ?? "";
  let decoded = query;
  try {
    decoded = decodeURIComponent(query).trim();
  } catch {
    // A literal percent sign can be part of a user's query.
  }
  return decoded === "{search_term_string}" ? "" : query;
}
