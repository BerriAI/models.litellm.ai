import { describe, expect, it } from "vitest";
import { isFindShortcut, type ShortcutKey } from "./shortcuts";

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
