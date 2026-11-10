import { afterEach, describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { GET } from "../../api/changelog";

const update = (kind: string, provider: string, modelId: string) => ({
  id: `s:${kind}:${provider}:${modelId}`,
  date: "2026-11-09",
  timestamp: "2026-11-09T00:00:00Z",
  kind,
  provider,
  title: "",
  description: "",
  source: "https://github.com/BerriAI/litellm/commit/s",
  sourceLabel: "",
  entries: [
    {
      modelId,
      name: modelId,
      changes: [{ field: "input_cost_per_token", before: 1e-6, after: 2e-6 }],
    },
  ],
});
const data = {
  generatedAt: "2026-11-09T01:00:00Z",
  providerNames: {},
  updates: [
    update("price", "bedrock", "bedrock/a"),
    update("price", "openai", "gpt"),
    update("deprecation", "bedrock", "bedrock/b"),
    update("metadata", "openai", "gpt-meta"),
  ],
};
const items = (xml: string) => {
  const doc = new new Window().DOMParser().parseFromString(xml, "text/xml");
  return [...doc.querySelectorAll("item")].map((i) => ({
    kind: i.querySelector("category")?.textContent,
    body: i.querySelector("description")?.textContent ?? "",
  }));
};
const feed = (query: string) =>
  GET(new Request(`https://models.litellm.ai/api/changelog${query}`));

describe("/changelog.xml function", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("renders the default feed without metadata and filters by kind and providers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL | string) => {
        expect(String(url)).toBe("https://models.litellm.ai/changelog.json");
        return Response.json(data);
      }),
    );
    const full = await feed("");
    expect(full.headers.get("content-type")).toBe(
      "application/rss+xml; charset=utf-8",
    );
    expect(full.headers.get("cache-control")).toContain("s-maxage=");
    const fullXml = await full.text();
    expect(items(fullXml).map((i) => i.kind)).toEqual([
      "price",
      "price",
      "deprecation",
    ]);
    expect(fullXml).toContain(
      '<atom:link href="https://models.litellm.ai/changelog.xml" rel="self"',
    );
    const filtered = await (
      await feed("?kind=price&providers=bedrock,databricks")
    ).text();
    expect(items(filtered)).toEqual([
      { kind: "price", body: expect.stringContaining("bedrock/a") },
    ]);
    expect(filtered).toContain(
      '<atom:link href="https://models.litellm.ai/changelog.xml?kind=price&amp;providers=bedrock,databricks" rel="self"',
    );
    expect(
      items(await (await feed("?kind=metadata")).text()).map((i) => i.body),
    ).toEqual([expect.stringContaining("gpt-meta")]);
    expect(items(await (await feed("?providers=nobody")).text())).toEqual([]);
    const hourly = items(await (await feed("?digest=1h")).text());
    expect(hourly.map((i) => i.kind)).toEqual(["digest"]);
    expect(hourly[0].body).toContain("• gpt on OpenAI");
    expect(items(await (await feed("?digest=bogus")).text())).toHaveLength(3);
    const digest = items(await (await feed("?digest=commit")).text());
    expect(digest).toEqual([
      {
        kind: "digest",
        body: expect.stringContaining("• bedrock/a on Amazon Bedrock"),
      },
    ]);
    expect(digest[0].body).toContain("• gpt on OpenAI");
    expect(digest[0].body).toContain("• bedrock/b on Amazon Bedrock");
    expect(digest[0].body).not.toContain("gpt-meta");
    expect(
      items(await (await feed("?digest=commit&kind=price")).text())[0].body,
    ).not.toContain("bedrock/b");
  });
  it("answers 503 without caching when the changelog data cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );
    const res = await feed("?kind=price");
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
