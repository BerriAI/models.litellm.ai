import { describe, expect, test } from "vitest";
import { getLiteLLmSdkSnippet } from "../../src/modelPresentation";
import { providersPage } from "./app-pages";
import { pageCopy } from "./copy";
import { groupCostMap, type CostMap } from "./group";
import { modelBody } from "./html";
import { buildModelView } from "./model-view";
import {
  hubProvider,
  providerDocsUrl,
  type ProviderSupport,
} from "./providers";

const support: ProviderSupport = {
  providers: {
    bedrock: {
      display_name: "AWS - Bedrock (`bedrock`)",
      url: "https://docs.litellm.ai/docs/providers/bedrock",
      endpoints: { chat_completions: true },
    },
    bedrock_mantle: {
      display_name: "Bedrock Mantle (`bedrock_mantle`)",
      url: "https://docs.litellm.ai/docs/providers/bedrock#bedrock-mantle",
      endpoints: { chat_completions: true, messages: true, responses: true },
    },
  },
};

const mantleRow = {
  litellm_provider: "bedrock_mantle",
  mode: "chat",
  input_cost_per_token: 4.4e-6,
  output_cost_per_token: 22e-6,
  max_input_tokens: 1_000_000,
  max_output_tokens: 128_000,
};

const costMap: CostMap = {
  "anthropic.claude-opus-5-5": {
    ...mantleRow,
    litellm_provider: "bedrock_converse",
    input_cost_per_token: 4e-6,
    output_cost_per_token: 20e-6,
    max_output_tokens: 64_000,
  },
  "bedrock_mantle/anthropic.claude-opus-5-5": mantleRow,
  "bedrock_mantle/us-gov-west-1/anthropic.claude-opus-5-5": {
    ...mantleRow,
    input_cost_per_token: 4.8e-6,
    output_cost_per_token: 24e-6,
  },
};

function opusView() {
  const group = groupCostMap(costMap).find(
    (entry) => entry.pageKey === "claude-opus-5-5",
  )!;
  return buildModelView(group, "claude-opus-5-5", {}, support, null);
}

describe("Amazon Bedrock Mantle provider pages", () => {
  test("should keep Mantle separate while grouping Bedrock Converse with Bedrock", () => {
    expect(hubProvider("bedrock_mantle")).toBe("bedrock_mantle");
    expect(hubProvider("bedrock_converse")).toBe("bedrock");
    expect(hubProvider("bedrock")).toBe("bedrock");
    expect(opusView().providers).toEqual(
      expect.arrayContaining([
        { name: "Amazon Bedrock", hub: "bedrock" },
        { name: "Amazon Bedrock Mantle", hub: "bedrock_mantle" },
      ]),
    );
  });

  test("should use Mantle's own provider documentation metadata", () => {
    expect(providerDocsUrl("bedrock_mantle", support)).toBe(
      support.providers!.bedrock_mantle.url,
    );
    expect(opusView().docs).toContainEqual({
      name: "Amazon Bedrock Mantle",
      url: support.providers!.bedrock_mantle.url,
    });
  });

  test("should preserve Mantle pricing, output limits and routing names from the cost map", () => {
    const view = opusView();
    const mantleRows = view.rows.filter(
      (row) => row.provider === "bedrock_mantle",
    );
    expect(mantleRows).toHaveLength(2);
    for (const row of mantleRows) {
      const source = costMap[row.key];
      expect(row).toMatchObject({
        hub: "bedrock_mantle",
        modelString: row.key,
        maxOutput: 128_000,
        context: 1_000_000,
      });
      expect(row.prices.input).toBeCloseTo(
        (source.input_cost_per_token as number) * 1e6,
      );
      expect(row.prices.output).toBeCloseTo(
        (source.output_cost_per_token as number) * 1e6,
      );
      expect(getLiteLLmSdkSnippet(row.mode, row.modelString)).toContain(
        `model="${row.key}"`,
      );
    }
    expect(
      view.rows.find((row) => row.provider === "bedrock_converse")?.maxOutput,
    ).toBe(64_000);
  });

  test("should link Mantle model rows to their dedicated pricing page", () => {
    const view = opusView();
    const html = modelBody(view, pageCopy(view, "2026-10-24"), {
      buildDate: "2026-10-24",
      lastChanged: "2026-10-24",
      related: [],
      history: [],
      hubs: new Set(["bedrock", "bedrock_mantle"]),
    });
    expect(html).toContain(
      '<a href="/providers/bedrock_mantle">Amazon Bedrock Mantle</a>',
    );
    expect(html).toContain('<a href="/providers/bedrock">Amazon Bedrock</a>');
    expect(html).not.toContain(
      '<a href="/providers/bedrock">Amazon Bedrock Mantle</a>',
    );
  });

  test("should link Mantle's provider directory entry to its own priced models", () => {
    const page = providersPage(
      support,
      [
        { hub: "bedrock", name: "Amazon Bedrock", count: 10 },
        { hub: "bedrock_mantle", name: "Amazon Bedrock Mantle", count: 2 },
      ],
      "2026-10-24",
    );
    const mantleEntry = page.body
      .match(/<tr>.*?<\/tr>/g)
      ?.find((row) => row.includes(">Amazon Bedrock Mantle</a>"));
    expect(mantleEntry).toContain(
      '<a href="/providers/bedrock_mantle">2 models</a>',
    );
    expect(mantleEntry).not.toContain('href="/providers/bedrock"');
  });
});
