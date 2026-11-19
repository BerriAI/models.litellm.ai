import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../api/deprecation-feed";
import middleware from "../../middleware";
import { groupDeprecations } from "../../src/deprecations";
import { deprecationRss } from "./deprecation-feed";
import { deprecationSearchIndex } from "./deprecation-pages";

const listing = (
  name: string,
  date: string,
  firstObservedOn = "2026-10-01",
) => ({
  key: name,
  slug: name,
  name,
  modelId: `azure/${name}`,
  provider: "azure",
  providerName: "Azure",
  date,
  firstObservedOn,
});
const rows = deprecationSearchIndex(
  groupDeprecations([
    listing("yesterday", "2026-11-18"),
    listing("today", "2026-11-19"),
    {
      ...listing("week", "2026-11-26", "2026-11-18"),
      successor: "azure/next",
      reference: "https://example.com/notice?id=1&source=provider",
    },
    listing("eight-days", "2026-11-27"),
    listing("thirty-days", "2026-12-19"),
    listing("later", "2026-12-20"),
  ]),
);
const origin = "https://models.litellm.ai";
const items = (xml: string) => {
  const doc = new new Window().DOMParser().parseFromString(xml, "text/xml");
  expect(doc.querySelector("parsererror")).toBeNull();
  return [...doc.querySelectorAll("item")].map((item) => ({
    name: item.querySelector("title")?.textContent?.split(" ")[0],
    guid: item.querySelector("guid")?.textContent,
    date: item.querySelector("pubDate")?.textContent,
    description: item.querySelector("description")?.textContent,
    link: item.querySelector("link")?.textContent,
  }));
};

async function filtered(query: string) {
  const rewrite = middleware(
    new Request(`${origin}/deprecated-models.xml?${query}`),
  );
  const target = rewrite?.headers.get("x-middleware-rewrite");
  expect(target).toBe(`${origin}/api/deprecation-feed?${query}`);
  return GET(new Request(target!));
}

describe("deprecation RSS window", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("tracks the validated window and leaves the default subscription event unchanged", async () => {
    vi.stubEnv("VITE_MIXPANEL_TOKEN", "test-token");
    const sent = vi.fn().mockResolvedValue(new Response("1"));
    vi.stubGlobal("fetch", sent);
    const pending: Promise<unknown>[] = [];
    const context = {
      waitUntil: (work: Promise<unknown>) => pending.push(work),
    };
    for (const query of ["", "?days=0", "?days=bad"])
      middleware(
        new Request(`${origin}/deprecated-models.xml${query}`),
        context,
      );
    await Promise.all(pending);
    const events = sent.mock.calls.map(
      ([, init]) => JSON.parse((init as RequestInit).body as string)[0],
    );
    expect(events.map(({ event }) => event)).toEqual(
      Array(3).fill("Feed Fetched"),
    );
    expect(events.map(({ properties }) => properties.days)).toEqual([
      undefined,
      0,
      undefined,
    ]);
  });

  it("leaves the existing URL on the static, effective-date feed", () => {
    expect(
      middleware(new Request(`${origin}/deprecated-models.xml`)),
    ).toBeUndefined();
    expect(
      middleware(new Request(`${origin}/deprecated-models.xml?source=feed`)),
    ).toBeUndefined();
    const xml = deprecationRss(rows, "2026-11-19");
    expect(items(xml).map((item) => item.name)).toEqual(["today", "yesterday"]);
    expect(items(xml)[0].date).toBe("Thu, 19 Nov 2026 00:00:00 GMT");
  });

  it("serves different windows from the same data with stable GUIDs and non-future publication dates", async () => {
    vi.setSystemTime(new Date("2026-11-19T23:59:59Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) => {
        expect(url.href).toBe(`${origin}/deprecated-models.json`);
        return Response.json(rows);
      }),
    );
    const response = await filtered("days=7");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/rss+xml; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    const seven = await response.text();
    const thirty = await (await filtered("days=30")).text();
    expect(seven).toContain(
      `href="${origin}/deprecated-models.xml?days=7" rel="self"`,
    );
    expect(thirty).toContain(
      `href="${origin}/deprecated-models.xml?days=30" rel="self"`,
    );
    expect(items(seven).map((item) => item.name)).toEqual(["week", "today"]);
    expect(items(thirty).map((item) => item.name)).toEqual([
      "thirty-days",
      "week",
      "eight-days",
      "today",
    ]);
    const week = items(seven)[0];
    expect(week.date).toBe("Thu, 19 Nov 2026 00:00:00 GMT");
    expect(week.link).toBe(
      `${origin}/deprecated-models/2026-11?utm_source=rss&utm_medium=feed&utm_campaign=deprecated-models#week--azure--2026-11-26`,
    );
    expect(week.description).toContain("Effective 2026-11-26 on Azure");
    expect(week.description).toContain("Recommended replacement: azure/next");
    expect(week.description).toContain(
      "https://example.com/notice?id=1&source=provider",
    );
    expect(items(thirty)[1]).toMatchObject({
      guid: week.guid,
      date: "Wed, 18 Nov 2026 00:00:00 GMT",
    });
    expect(
      items(await (await filtered("days=0")).text()).map((item) => item.name),
    ).toEqual(["today"]);

    vi.setSystemTime(new Date("2026-11-20T00:00:00Z"));
    const nextDay = items(await (await filtered("days=7")).text());
    expect(nextDay.map((item) => item.name)).toEqual(["eight-days", "week"]);
    expect(nextDay[1]).toEqual(week);
    expect(items(await (await filtered("days=0")).text())).toEqual([]);
  });

  it.each([
    "days=",
    "days=-1",
    "days=1.5",
    "days=abc",
    "days=366",
    "days=7&days=30",
  ])(
    "rejects %s instead of returning unfiltered notifications",
    async (query) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const response = await filtered(query);
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("reports an unavailable dataset as a retryable error, not an empty feed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({}, { status: 404 })),
    );
    const response = await filtered("days=7");
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
