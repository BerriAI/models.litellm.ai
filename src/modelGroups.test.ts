import { describe, expect, it } from "vitest";
import { cheapestBy, groupByModel, providerCount } from "./modelGroups";

const item = (
  name: string,
  provider: string,
  input: number,
  extra: Record<string, unknown> = {},
) => ({
  name,
  display_name: "Kimi K3",
  release_date: null as string | null,
  litellm_provider: provider,
  mode: "chat",
  input,
  ...extra,
});

const input = (m: { input: number }) => m.input;

describe("groupByModel", () => {
  it("groups listings that share a model page slug, cheapest member first", () => {
    const rows = groupByModel(
      [
        item("moonshot/kimi-k3", "moonshot", 3, {
          release_date: "2026-07-20",
          max_input_tokens: 1_000_000,
        }),
        item("sail/kimi-k3", "sail", 2.5, {
          release_date: "2026-07-16",
          max_input_tokens: 918_000,
        }),
        item("fireworks_ai/kimi-k3", "fireworks_ai", 0),
      ],
      {
        "moonshot/kimi-k3": "kimi-k3",
        "sail/kimi-k3": "kimi-k3",
        "fireworks_ai/kimi-k3": "kimi-k3",
      },
      input,
    );
    expect(rows).toHaveLength(1);
    const [group] = rows as any[];
    expect(group.name).toBe("group:page:kimi-k3");
    expect(group.groupSlug).toBe("kimi-k3");
    expect(group.members.map((m: any) => m.name)).toEqual([
      "sail/kimi-k3",
      "moonshot/kimi-k3",
      "fireworks_ai/kimi-k3",
    ]);
    expect(group.release_date).toBe("2026-07-16");
    expect(group.max_input_tokens).toBe(1_000_000);
  });

  it("leaves a model with a single listing as a plain row", () => {
    const only = item("moonshot/kimi-k3", "moonshot", 3);
    expect(
      groupByModel([only], { "moonshot/kimi-k3": "kimi-k3" }, input),
    ).toEqual([only]);
  });

  it("falls back to display name and mode when there is no page slug", () => {
    const rows = groupByModel(
      [
        item("a/kimi-k3", "a", 1),
        item("b/kimi-k3", "b", 2),
        item("c/kimi-k3", "c", 1, { mode: "embedding" }),
      ],
      {},
      input,
    ) as any[];
    expect(rows.map((r) => r.name)).toEqual([
      "group:name:kimi k3|chat",
      "c/kimi-k3",
    ]);
  });
});

describe("cheapestBy and providerCount", () => {
  it("skips unpriced members and counts distinct providers", () => {
    const members = [item("a", "x", 0), item("b", "x", 4), item("c", "y", 2)];
    expect(cheapestBy(members, input).name).toBe("c");
    expect(providerCount(members)).toBe(2);
  });
});
