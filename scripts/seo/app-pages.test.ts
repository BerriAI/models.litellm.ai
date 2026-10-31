import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { benchmarksPage, codingBenchmarksPage, homePage, searchPage } from "./app-pages";
import { siteNodes } from "./jsonld";
import { SITE_URL } from "./site";

const hubs = [{ hub: "openai", name: "OpenAI", count: 2 }];
const recent = [
  { slug: "gpt-4o", name: "GPT-4o", price: "$2.50 / $10 per 1M tokens" },
];

describe("Discover and search pages", () => {
  test("should give Discover a crawlable root with links to existing catalog tools", () => {
    const page = homePage(2, hubs, recent, "2026-10-23");
    expect(page.body).toContain("<h1>AI model catalog</h1>");
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


describe("coding benchmark static page", () => {
  test("should publish only complete same-cohort rows and withhold timing", () => {
    const data = JSON.parse(readFileSync("public/benchmarks/results.json", "utf8"));
    const partial = { ...data.runs[0], id: "partial-fixture", modelName: "Unfinished fixture", status: "running", attempts: 1 };
    const page = codingBenchmarksPage({ ...data, runs: [...data.runs, partial] });
    expect(page.body).toContain("6 tasks × 1 trial(s)");
    expect(page.body).toContain("4 / 6");
    expect(page.body).toContain("Successful tasks / USD");
    expect(page.body).not.toContain("Unfinished fixture");
    expect(page.body).not.toContain("seconds");
    expect(page.body).toContain("timing is not ranked");
    expect(page.breadcrumbs.at(-1)?.path).toBe("/benchmarks");
  });
});


test("published benchmark page keeps source metrics separate from the pilot and links to the catalog", () => {
  const page = benchmarksPage({source: "public-feeds", asOf: "2026-10-31", fetchedAt: null, epochAsOf: null, terminalBenchAsOf: null, terminalBenchVersion: "4.0", models: [{slug: "test", name: "Example model", modelId: null, lab: null, href: "https://epoch.ai/eci", intelligence: 100, coding: 0.5, costPerTask: 1, harness: "Example agent", setting: null, trials: 10, passed: 5, totalCost: 10}]}, JSON.parse(readFileSync("public/benchmarks/results.json", "utf8")));
  expect(page.body).toContain("100.0 ECI points");
  expect(page.body).toContain("50.0% Tasks solved");
  expect(page.body).toContain('/search?q=Example%20model');
  expect(page.body).toContain("LiteLLM coding pilot");
  expect(page.body.match(/<h1>/g)).toHaveLength(1);
});
