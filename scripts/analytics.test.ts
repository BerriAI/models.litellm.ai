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

  it("reports the kind and providers a /changelog.xml fetch asked for", async () => {
    vi.stubEnv("VITE_MIXPANEL_TOKEN", "test-token");
    const sent = vi.fn().mockResolvedValue(new Response("1"));
    vi.stubGlobal("fetch", sent);
    try {
      const pending: Promise<unknown>[] = [];
      const context = { waitUntil: (p: Promise<unknown>) => pending.push(p) };
      expect(
        middleware(
          new Request(
            "https://models.litellm.ai/changelog.xml?kind=price&providers=bedrock,databricks",
          ),
          context,
        ),
      ).toBeUndefined();
      expect(
        middleware(
          new Request("https://models.litellm.ai/changelog.xml"),
          context,
        ),
      ).toBeUndefined();
      await Promise.all(pending);
      const events = sent.mock.calls.map(
        ([, init]) => JSON.parse((init as RequestInit).body as string)[0],
      );
      expect(events.map((e) => e.event)).toEqual([
        "Feed Fetched",
        "Feed Fetched",
      ]);
      expect(events[0].properties.kind).toEqual(["price"]);
      expect(events[0].properties.providers).toEqual(["bedrock", "databricks"]);
      expect(events[1].properties).not.toHaveProperty("kind");
      expect(events[1].properties).not.toHaveProperty("providers");
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
