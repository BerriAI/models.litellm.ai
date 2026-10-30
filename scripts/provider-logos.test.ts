import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import catalogProviders from "./provider-logo-catalog.json";
import providerLogos from "../src/providerLogos.json";
import { getProviderLogo } from "../src/providers";
import { auditProviderLogos } from "./provider-logos";

type ArtworkSource = {
  file: string | null;
  source: string;
  homepage: string;
  sha256?: string;
  note?: string;
};

const sources = JSON.parse(
  readFileSync("public/provider-logos/sources.json", "utf8"),
) as Record<string, ArtworkSource>;

describe("audited provider artwork", () => {
  it("should cover every provider in both LiteLLM catalogs at the audit date", () => {
    expect(auditProviderLogos(catalogProviders)).toEqual([]);
  });

  it("should return new unaudited providers once each instead of failing the build", () => {
    expect(
      auditProviderLogos(["zeta-new", "Baseten", "alpha-new", " Zeta-New "]),
    ).toEqual(["alpha-new", "zeta-new"]);
  });

  it("should fail the build when a provider from the audited catalog loses its logo entry", () => {
    const { baseten: _dropped, ...logosWithoutBaseten } = providerLogos;
    expect(() =>
      auditProviderLogos(["Baseten", "new-provider"], { logos: logosWithoutBaseten }),
    ).toThrow("baseten: listed in scripts/provider-logo-catalog.json");
  });

  it("should still fail the build when a mapped logo file is missing", () => {
    expect(() =>
      auditProviderLogos(["new-provider", "baseten"], { publicDir: "/nonexistent" }),
    ).toThrow("baseten: missing");
  });

  it("should show Baseten's official artwork and resolve aliases case-insensitively", () => {
    expect(getProviderLogo("Baseten")).toMatch(/\/upstream\/baseten\./);
    expect(getProviderLogo("OPENCODE_GO")).toBe("/provider-logos/upstream/opencode_go.svg");
    for (const [alias, provider] of [
      ["anthropic_text", "anthropic"],
      ["bedrock_mantle", "bedrock"],
      ["cohere_chat", "cohere"],
      ["ollama_chat", "ollama"],
      ["fireworks_ai-embedding-models", "fireworks_ai"],
      ["vertex_ai-anthropic_models", "vertex_ai"],
    ]) {
      expect(getProviderLogo(alias.toUpperCase())).toBe(
        getProviderLogo(provider),
      );
    }
    expect(getProviderLogo("unknown")).toBeNull();
    expect(getProviderLogo("__proto__")).toBeNull();
    expect(getProviderLogo("constructor")).toBeNull();
  });

  it("should record upstream provenance and exact hashes for all mapped artwork", () => {
    expect(Object.keys(sources).sort()).toEqual(
      Object.keys(providerLogos).sort(),
    );
    for (const [provider, file] of Object.entries(providerLogos)) {
      const source = sources[provider];
      expect(source.file, provider).toBe(file);
      expect(source.source, provider).toMatch(/^https:\/\//);
      expect(source.homepage, provider).toMatch(/^https:\/\//);
      if (!file) {
        expect(source.note, provider).toMatch(
          /adapter|no .*logo|no .*brand|no verifiable/i,
        );
        continue;
      }
      expect(file, provider).toMatch(
        /^(upstream\/)?[\w.-]+\.(svg|png|webp|ico|jpg|jpeg)$/,
      );
      const bytes = readFileSync(path.join("public/provider-logos", file));
      expect(bytes.length, provider).toBeGreaterThan(40);
      expect(createHash("sha256").update(bytes).digest("hex"), provider).toBe(
        source.sha256,
      );
      if (file.endsWith(".svg")) {
        const svg = bytes.toString("utf8");
        expect(svg, provider).toMatch(/<svg[\s>]/);
        expect(svg, provider).not.toMatch(
          /currentColor|<script|<foreignObject|\bon\w+\s*=|(?:href|url)\s*=?\s*["'(]*https?:/i,
        );
      } else {
        expect(bytes.subarray(0, 200).toString("utf8"), provider).not.toMatch(
          /<!doctype html|<html/i,
        );
      }
    }
  });
});
