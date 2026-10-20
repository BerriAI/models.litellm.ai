import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  getLiteLLmProxyCurlSnippet,
  getLiteLLmProxyCurlSnippetHtml,
} from "./modelPresentation";

const model = "openai/gpt-4o";
const modes = [
  undefined,
  "chat",
  "image_generation",
  "image_edit",
  "embedding",
  "audio_transcription",
  "audio_speech",
] as const;

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

describe("proxy curl snippets", () => {
  it.each(modes)("expands the API key and sends valid JSON for %s", (mode) => {
    const output = execFileSync(
      "bash",
      [
        "-c",
        'curl() { printf "%s\\n" "$@"; }\n' +
          getLiteLLmProxyCurlSnippet(mode, model),
      ],
      {
        encoding: "utf8",
        env: { ...process.env, LITELLM_API_KEY: "test-key-abc" },
      },
    );
    const lines = output.split("\n");

    expect(lines).toContain("Authorization: Bearer test-key-abc");

    if (
      mode === undefined ||
      mode === "chat" ||
      mode === "image_generation" ||
      mode === "embedding" ||
      mode === "audio_speech"
    ) {
      const dataIndex = lines.indexOf("-d");
      expect(dataIndex).toBeGreaterThanOrEqual(0);
      expect(JSON.parse(lines.slice(dataIndex + 1).join("\n")).model).toBe(
        model,
      );
    }
  });

  it.each(modes)("keeps the displayed snippet in sync for %s", (mode) => {
    const plainSnippet = getLiteLLmProxyCurlSnippet(mode, model);
    const displayedSnippet = stripHtml(
      getLiteLLmProxyCurlSnippetHtml(mode, model),
    );
    const expected =
      mode === undefined || mode === "chat"
        ? `# Start proxy: litellm --model ${model}\n\n${plainSnippet}`
        : plainSnippet;

    expect(displayedSnippet).toBe(expected);
  });
});
