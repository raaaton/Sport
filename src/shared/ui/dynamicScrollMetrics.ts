export const DYNAMIC_SCROLL_TOLERANCE = 1.5;

export type ViewportFrame = { top: number; height: number };
export type KeyboardFrame = { top: number; height: number };

/** Measure only the part of the keyboard that actually covers this scroll view. */
export function keyboardOverlap(viewport: ViewportFrame | null, keyboard: KeyboardFrame | null): number {
  if (!viewport || !keyboard || !Number.isFinite(viewport.top) || !Number.isFinite(viewport.height) ||
      !Number.isFinite(keyboard.top) || !Number.isFinite(keyboard.height) || viewport.height <= 0 || keyboard.height <= 0) {
    return 0;
  }
  const overlap = Math.min(viewport.top + viewport.height, keyboard.top + keyboard.height) - Math.max(viewport.top, keyboard.top);
  return Math.max(0, Math.min(viewport.height, overlap));
}

/** Restore the pre-keyboard offset unless the user deliberately dragged the page while editing. */
export function keyboardDismissScrollOffset(savedOffset: number | null, userDragged: boolean): number | null {
  if (userDragged || savedOffset === null || !Number.isFinite(savedOffset)) return null;
  return savedOffset;
}

/** Avoid enabling scroll for sub-point layout noise around an exact fit. */
export function shouldEnableScroll(
  viewportHeight: number,
  contentHeight: number,
  tolerance = DYNAMIC_SCROLL_TOLERANCE,
): boolean {
  if (!Number.isFinite(viewportHeight) || !Number.isFinite(contentHeight) || viewportHeight <= 0) return false;
  return contentHeight - viewportHeight > tolerance;
}
