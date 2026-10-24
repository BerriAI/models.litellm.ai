import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { homePage, searchPage } from "./app-pages";
import { siteNodes } from "./jsonld";
import { SITE_URL } from "./site";

const hubs = [{ hub: "openai", name: "OpenAI", count: 2 }];
const recent = [
  { slug: "gpt-4o", name: "GPT-4o", price: "$2.50 / $10 per 1M tokens" },
];

describe("Discover and search pages", () => {
  test("should give Discover a crawlable root with links to existing catalog tools", () => {
    const page = homePage(2, hubs, recent, "2026-10-23");
    expect(page.body).toContain("<h1>Discover AI models</h1>");
    expect(page.body).toContain('href="/search"');
    expect(page.body).toContain('href="/compare"');
    expect(page.body).toContain('href="/models/gpt-4o"');
    expect(page.body).toContain('href="/providers/openai"');
    expect(page.lastmod).toBe("2026-10-23");
    expect(page.breadcrumbs).toEqual([{ name: "Home", path: "/" }]);
  });

  test("should keep the interactive search separate from the static model catalog", () => {
    const page = searchPage(2, hubs, recent, "2026-10-23");
    expect(page.body).toContain("<h1>Search AI models</h1>");
    expect(page.body).toContain('<form action="/search" method="get">');
    expect(page.body).toContain('name="q" type="search"');
    expect(page.body).toContain(
      'href="/models">Browse the full model catalog</a>',
    );
    expect(page.breadcrumbs.at(-1)).toEqual({
      name: "Search models",
      path: "/search",
    });
  });

  test("should keep site identity without publishing a literal search placeholder URL", () => {
    const website = siteNodes().find((node) => node["@type"] === "WebSite");
    expect(website).toMatchObject({
      url: `${SITE_URL}/`,
      name: "LiteLLM Model Catalog",
    });
    expect(website).not.toHaveProperty("potentialAction");
    expect(JSON.stringify(siteNodes())).not.toContain("search_term_string");
    const index = readFileSync(
      new URL("../../index.html", import.meta.url),
      "utf8",
    );
    const schemas = [
      ...index.matchAll(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
      ),
    ];
    expect(schemas.length).toBeGreaterThan(0);
    for (const schema of schemas) {
      expect(() => JSON.parse(schema[1])).not.toThrow();
      expect(schema[1]).not.toContain("SearchAction");
      expect(schema[1]).not.toContain("search_term_string");
    }
  });
});
