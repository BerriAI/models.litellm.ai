import { describe, expect, test } from "vitest";
import { sanitizeSearchQuery } from "./searchQuery";

describe("search query normalization", () => {
  test.each([
    "{search_term_string}",
    " {search_term_string} ",
    "%7Bsearch_term_string%7D",
    "%7bsearch_term_string%7d",
    "%20%7Bsearch_term_string%7D%20",
    new URLSearchParams("q=%7Bsearch_term_string%7D").get("q"),
  ])("should discard the legacy search template %s", (query) => {
    expect(sanitizeSearchQuery(query)).toBe("");
  });

  test.each([null, undefined, "", "   "])(
    "should accept an empty query",
    (query) => {
      expect(sanitizeSearchQuery(query)).toBe("");
    },
  );

  test.each([
    "openrouter/anthropic/claude-opus-5-5",
    "ft:gpt-4o:org:custom:123",
    "vendor%2Fmodel",
    "model%invalid",
    "Claude Sonnet",
  ])(
    "should trim surrounding whitespace without rewriting a model ID",
    (query) => {
      expect(sanitizeSearchQuery(`  ${query}  `)).toBe(query);
    },
  );
});
