/**
 * The focus-trap half of the dialog contract, extracted from the bottom sheet
 * so there is genuinely one implementation rather than one per surface - which
 * is what sheet.tsx's own doc comment already promised.
 *
 * The index math is split from the DOM work on purpose: the repo's vitest runs
 * in a node environment with no jsdom, so nextTrapIndex() is the part that can
 * actually be covered by a unit test.
 */

export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Which focusable Tab should land on, or null when the browser's own default is
 * already right. `activeIndex === -1` means focus is on the panel itself, which
 * is where it starts - Shift+Tab from there wraps to the last item.
 */
export function nextTrapIndex(
  count: number,
  activeIndex: number,
  shiftKey: boolean,
): number | null {
  if (count === 0) return null;
  if (shiftKey) return activeIndex <= 0 ? count - 1 : null;
  return activeIndex === count - 1 ? 0 : null;
}

/**
 * Cycle Tab within `panel`. Returns true when it handled the key, so callers
 * can fall through to their own handling when it didn't. A panel with nothing
 * focusable still swallows Tab rather than letting focus escape behind it.
 */
export function trapTab(
  panel: HTMLElement,
  event: { shiftKey: boolean; preventDefault: () => void },
): boolean {
  const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (focusables.length === 0) {
    event.preventDefault();
    return true;
  }
  const activeIndex = focusables.indexOf(document.activeElement as HTMLElement);
  const target = nextTrapIndex(focusables.length, activeIndex, event.shiftKey);
  if (target === null) return false;
  event.preventDefault();
  focusables[target].focus();
  return true;
}
