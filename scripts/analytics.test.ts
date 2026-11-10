import { describe, expect, it, vi } from "vitest";
import middleware, { machineFetchEvent } from "../middleware";
import { pageKind } from "../src/analyticsConfig";
import { feedLink, rssFeed } from "./seo/crawl";

describe("pageKind", () => {
  it("names every kind of page", () => {
    expect(pageKind("/")).toBe("models");
    expect(pageKind("/models/gpt-4o")).toBe("model");
    expect(pageKind("/providers/openai")).toBe("provider");
    expect(pageKind("/compare/a-vs-b")).toBe("compare");
    expect(pageKind("/compare/custom")).toBe("compare-tool");
    expect(pageKind("/new-models/2026-10")).toBe("new-models-month");
    expect(pageKind("/deprecated-models")).toBe("deprecated-models");
    expect(pageKind("/changelog/")).toBe("changelog");
  });
});

describe("feed links", () => {
  it("tags links back to the site and leaves guids and outside links alone", () => {
    expect(
      feedLink("https://models.litellm.ai/models/gpt-4o", "/new-models.xml"),
    ).toBe(
      "https://models.litellm.ai/models/gpt-4o?utm_source=rss&utm_medium=feed&utm_campaign=new-models",
    );
    expect(
      feedLink("https://github.com/BerriAI/litellm", "/changelog.xml"),
    ).toBe("https://github.com/BerriAI/litellm");
    const xml = rssFeed("t", "https://models.litellm.ai/new-models", "d", [
      {
        title: "x",
        link: "https://models.litellm.ai/models/x",
        description: "",
        date: "2026-10-01",
      },
    ]);
    expect(xml).toContain(
      "<link>https://models.litellm.ai/models/x?utm_source=rss&amp;utm_medium=feed&amp;utm_campaign=new-models</link>",
    );
    expect(xml).toContain(
      '<guid isPermaLink="true">https://models.litellm.ai/models/x</guid>',
    );
  });
});

describe("machine fetch tracking", () => {
  it("knows which fetches to report", () => {
    expect(machineFetchEvent("/new-models.xml")).toBe("Feed Fetched");
    expect(machineFetchEvent("/models/gpt-4o.md")).toBe("Markdown Fetched");
    expect(machineFetchEvent("/llms.txt")).toBe("llms.txt Fetched");
    expect(machineFetchEvent("/models/gpt-4o")).toBeUndefined();
  });

  it("reports in the background without changing the response", async () => {
    const pending: Promise<unknown>[] = [];
    const context = { waitUntil: (p: Promise<unknown>) => pending.push(p) };
    expect(
      middleware(
        new Request("https://models.litellm.ai/new-models.xml"),
        context,
      ),
    ).toBeUndefined();
    expect(pending).toHaveLength(1);
    const md = middleware(
      new Request("https://models.litellm.ai/models/gpt-4o", {
        headers: { accept: "text/markdown" },
      }),
      context,
    );
    expect(md?.headers.get("x-middleware-rewrite")).toBe(
      "https://models.litellm.ai/models/gpt-4o.md",
    );
    expect(pending).toHaveLength(2);
    await Promise.all(pending);
  });

  it("still reports when the runtime passes no context", async () => {
    vi.stubEnv("VITE_MIXPANEL_TOKEN", "test-token");
    const sent = vi.fn().mockResolvedValue(new Response("1"));
    vi.stubGlobal("fetch", sent);
    try {
      expect(
        middleware(new Request("https://models.litellm.ai/llms.txt")),
      ).toBeUndefined();
      await vi.waitFor(() => expect(sent).toHaveBeenCalledOnce());
      const [event] = JSON.parse(sent.mock.calls[0][1].body);
      expect(event.event).toBe("llms.txt Fetched");
      expect(event.properties.distinct_id).toMatch(/^fetch:[0-9a-f]{32}$/);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("rebuilds /changelog.xml from /changelog.json when the query filters it, and reports the filter", async () => {
    vi.stubEnv("VITE_MIXPANEL_TOKEN", "test-token");
    const updates = [
      {
        id: "s:price:bedrock",
        date: "2026-11-09",
        timestamp: "2026-11-09T00:00:00Z",
        kind: "price",
        provider: "bedrock",
        title: "",
        description: "",
        source: "https://github.com/BerriAI/litellm/commit/s",
        sourceLabel: "",
        entries: [
          {
            modelId: "bedrock/a",
            name: "A",
            changes: [
              { field: "input_cost_per_token", before: 1e-6, after: 2e-6 },
            ],
          },
        ],
      },
      {
        id: "s:price:openai",
        date: "2026-11-09",
        timestamp: "2026-11-09T00:00:00Z",
        kind: "price",
        provider: "openai",
        title: "",
        description: "",
        source: "https://github.com/BerriAI/litellm/commit/s",
        sourceLabel: "",
        entries: [
          {
            modelId: "gpt",
            name: "GPT",
            changes: [
              { field: "input_cost_per_token", before: 1e-6, after: 2e-6 },
            ],
          },
        ],
      },
      {
        id: "s:deprecation:bedrock",
        date: "2026-11-09",
        timestamp: "2026-11-09T00:00:00Z",
        kind: "deprecation",
        provider: "bedrock",
        title: "",
        description: "",
        source: "https://github.com/BerriAI/litellm/commit/s",
        sourceLabel: "",
        entries: [
          {
            modelId: "bedrock/b",
            name: "B",
            changes: [
              { field: "deprecation_date", before: null, after: "2027-01-01" },
            ],
          },
        ],
      },
    ];
    const sent = vi.fn(async (url: string | URL) =>
      String(url).endsWith("/changelog.json")
        ? new Response(
            JSON.stringify({
              generatedAt: "2026-11-09T01:00:00Z",
              providerNames: {},
              updates,
            }),
            { headers: { "content-type": "application/json" } },
          )
        : new Response("1"),
    );
    vi.stubGlobal("fetch", sent);
    try {
      const pending: Promise<unknown>[] = [];
      const context = { waitUntil: (p: Promise<unknown>) => pending.push(p) };
      const url =
        "https://models.litellm.ai/changelog.xml?kind=price&providers=bedrock,databricks";
      const response = await middleware(new Request(url), context);
      expect(response?.headers.get("content-type")).toBe(
        "application/rss+xml; charset=utf-8",
      );
      const xml = await response!.text();
      expect(xml.match(/<item>/g)).toHaveLength(1);
      expect(xml).toContain("bedrock/a");
      expect(xml).not.toContain("gpt");
      expect(xml).toContain(
        '<atom:link href="https://models.litellm.ai/changelog.xml?kind=price&amp;providers=bedrock,databricks" rel="self"',
      );
      await Promise.all(pending);
      const track = sent.mock.calls.find(([u]) =>
        String(u).includes("mixpanel"),
      );
      const [event] = JSON.parse((track![1] as RequestInit).body as string);
      expect(event.event).toBe("Feed Fetched");
      expect(event.properties.kind).toEqual(["price"]);
      expect(event.properties.providers).toEqual(["bedrock", "databricks"]);
      expect(
        await middleware(
          new Request("https://models.litellm.ai/changelog.xml"),
          context,
        ),
      ).toBeUndefined();
      expect(
        await middleware(
          new Request("https://models.litellm.ai/changelog.xml?utm_source=x"),
          context,
        ),
      ).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
