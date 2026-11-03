// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { outboundLinkProps } from "./analyticsConfig";

function link(href: string, text = "Provider notice") {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = `  ${text}  `;
  return a;
}

describe("outboundLinkProps", () => {
  const origin = "https://models.litellm.ai";

  it("reports links to other sites with url, host and trimmed text", () => {
    expect(outboundLinkProps(link("https://platform.openai.com/docs/deprecations"), origin)).toEqual({
      url: "https://platform.openai.com/docs/deprecations",
      host: "platform.openai.com",
      text: "Provider notice",
    });
  });

  it("ignores same-site and non-http links", () => {
    expect(outboundLinkProps(link("https://models.litellm.ai/deprecated-models"), origin)).toBeUndefined();
    expect(outboundLinkProps(link("mailto:support@example.com"), origin)).toBeUndefined();
  });
});
