import type { BootstrapPopupResponse } from "@/lib/messaging";

/**
 * Last-known bootstrap snapshot, cached in the popup's own `localStorage` —
 * synchronous and available at first render, unlike async `browser.storage` or
 * the service worker's in-memory state. Seeding from it lets the popup paint
 * real content immediately and reconcile with a live bootstrap, so the loading
 * spinner only shows on the first open. Holds no secrets: `AuthState` carries
 * identity and `hasToken`, never the bearer itself.
 */

const KEY = "selectorForge.popupSnapshot.v1";

export function readCachedSnapshot(): BootstrapPopupResponse | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BootstrapPopupResponse>;
    // Minimal shape guard: a stale/foreign value just falls back to a clean
    // load rather than rendering garbage. The live bootstrap reconciles anyway.
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.auth !== "object" ||
      parsed.auth === null ||
      !Array.isArray(parsed.history)
    ) {
      return null;
    }
    return parsed as BootstrapPopupResponse;
  } catch {
    return null;
  }
}

export function writeCachedSnapshot(snapshot: BootstrapPopupResponse): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    /* private mode / quota — the optimistic cache is best-effort. */
  }
}
