import { selectorModeSchema, type SelectorMode } from "./schema";

const LAST_MODE_KEY = "selector.lastMode";

/**
 * The mode (single/list) the user most recently started a pick with. Persisted
 * so "New selector" can jump straight back into the picker without re-choosing
 * single vs list. Cleared when a pick is cancelled, so the next run falls back
 * to the mode chooser.
 */
export async function loadLastMode(): Promise<SelectorMode | null> {
  const store = browser?.storage?.local;
  if (!store) return null;
  try {
    const raw = (await store.get(LAST_MODE_KEY))[LAST_MODE_KEY];
    const parsed = selectorModeSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveLastMode(mode: SelectorMode): Promise<void> {
  const store = browser?.storage?.local;
  if (!store) return;
  try {
    await store.set({ [LAST_MODE_KEY]: mode });
  } catch {
    /* best effort — the popup just falls back to the chooser */
  }
}

export async function clearLastMode(): Promise<void> {
  const store = browser?.storage?.local;
  if (!store) return;
  try {
    await store.remove(LAST_MODE_KEY);
  } catch {
    /* best effort */
  }
}
