export type ShortcutKey = Pick<
  KeyboardEvent,
  "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

export const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform);

export function isFindShortcut(event: ShortcutKey, isMac: boolean): boolean {
  const modifierHeld = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (!modifierHeld || event.altKey || event.shiftKey) return false;
  return /^[a-z]$/i.test(event.key)
    ? event.key.toLowerCase() === "f"
    : event.code === "KeyF";
}
