// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { isFindShortcut, opensSiteSearch, type ShortcutKey } from "./shortcuts";

const press = (overrides: Partial<ShortcutKey>): ShortcutKey => ({
  key: "f",
  code: "KeyF",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

describe("isFindShortcut", () => {
  it("matches Ctrl+F off a Mac and Cmd+F on a Mac", () => {
    expect(isFindShortcut(press({ ctrlKey: true }), false)).toBe(true);
    expect(isFindShortcut(press({ metaKey: true }), true)).toBe(true);
  });

  it("leaves Ctrl+F on a Mac alone, where it moves the text cursor", () => {
    expect(isFindShortcut(press({ ctrlKey: true }), true)).toBe(false);
  });

  it("ignores the Windows key with F off a Mac", () => {
    expect(isFindShortcut(press({ metaKey: true }), false)).toBe(false);
  });

  it("ignores F with Shift or Alt held, and plain F", () => {
    expect(isFindShortcut(press({ ctrlKey: true, shiftKey: true, key: "F" }), false)).toBe(false);
    expect(isFindShortcut(press({ ctrlKey: true, altKey: true }), false)).toBe(false);
    expect(isFindShortcut(press({}), false)).toBe(false);
  });

  it("matches the F key on a layout without Latin letters", () => {
    expect(isFindShortcut(press({ ctrlKey: true, key: "а" }), false)).toBe(true);
  });

  it("follows the letter, not the key position, on a Latin layout like Dvorak", () => {
    expect(isFindShortcut(press({ ctrlKey: true, key: "f", code: "KeyY" }), false)).toBe(true);
    expect(isFindShortcut(press({ ctrlKey: true, key: "u", code: "KeyF" }), false)).toBe(false);
  });
});

describe("opensSiteSearch", () => {
  const ctrlF = press({ ctrlKey: true });

  function page(html: string) {
    document.body.innerHTML = html;
    return {
      searchInput: document.getElementById("query") ?? undefined,
      focus: (id: string) => document.getElementById(id)?.focus(),
    };
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("moves Ctrl+F from the page and from the token filters to the site search", () => {
    const { searchInput, focus } = page('<input id="query"><input id="maxInputTokens" type="number">');
    expect(opensSiteSearch(ctrlF, false, document, searchInput)).toBe(true);
    focus("maxInputTokens");
    expect(opensSiteSearch(ctrlF, false, document, searchInput)).toBe(true);
  });

  it("lets a second Ctrl+F in the site search reach the browser's find bar", () => {
    const { searchInput, focus } = page('<input id="query">');
    focus("query");
    expect(opensSiteSearch(ctrlF, false, document, searchInput)).toBe(false);
  });

  it("leaves Ctrl+F to the browser while a modal dialog is open", () => {
    const { searchInput, focus } = page(
      '<input id="query"><div role="dialog" aria-modal="true"><textarea id="request"></textarea></div>',
    );
    focus("request");
    expect(opensSiteSearch(ctrlF, false, document, searchInput)).toBe(false);
    focus("query");
    document.getElementById("query")?.blur();
    expect(opensSiteSearch(ctrlF, false, document, searchInput)).toBe(false);
  });

  it("ignores keys that are not the find shortcut", () => {
    const { searchInput } = page('<input id="query">');
    expect(opensSiteSearch(press({ ctrlKey: true, key: "g", code: "KeyG" }), false, document, searchInput)).toBe(false);
  });
});
