import { z } from "zod";
import {
  selectorHistoryEntrySchema,
  type SelectorHistoryEntry,
} from "./schema";

const HISTORY_KEY = "selector.history";

const MAX_ENTRIES = 50;

const historyArraySchema = z.array(selectorHistoryEntrySchema);

export async function loadSelectorHistory(): Promise<SelectorHistoryEntry[]> {
  const store = browser?.storage?.local;
  if (!store) return [];
  try {
    const raw = (await store.get(HISTORY_KEY))[HISTORY_KEY];
    const parsed = historyArraySchema.safeParse(raw);
    return parsed.success ? parsed.data : [];
  } catch (error) {
    console.debug("[selector-extension] history load failed", error);
    return [];
  }
}

export async function appendSelectorHistory(
  entry: SelectorHistoryEntry
): Promise<SelectorHistoryEntry[]> {
  const store = browser?.storage?.local;
  const next = [entry, ...(await loadSelectorHistory())].slice(0, MAX_ENTRIES);
  if (store) {
    try {
      await store.set({ [HISTORY_KEY]: next });
    } catch (error) {
      console.debug("[selector-extension] history persist failed", error);
    }
  }
  return next;
}

/**
 * Patch a single persisted history entry in place (matched by id). Used to
 * record the user's thumbs up/down rating; a no-op if the id is gone (entry
 * aged out of the capped list). Returns the updated list.
 */
export async function updateSelectorHistoryEntry(
  id: string,
  patch: Partial<Pick<SelectorHistoryEntry, "feedback">>
): Promise<SelectorHistoryEntry[]> {
  const store = browser?.storage?.local;
  const next = (await loadSelectorHistory()).map((entry) =>
    entry.id === id ? { ...entry, ...patch } : entry
  );
  if (store) {
    try {
      await store.set({ [HISTORY_KEY]: next });
    } catch (error) {
      console.debug("[selector-extension] history patch failed", error);
    }
  }
  return next;
}
