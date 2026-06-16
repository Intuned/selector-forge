import {
  SELECTOR_HISTORY_SCHEMA_VERSION,
  type PageContext,
  type SelectorMode,
  type SelectorState,
} from "@/lib/state";

/**
 * Seed a fresh in-flight selector session on the BG state singleton and return
 * its id. Records the owning tab on `meta` and sets the contract slot to the
 * `picking` starting frame (empty targets). The popup/CLI start path
 * (`seedAndActivateSession`) and the page right-click flow (`handleContextMenuClick`)
 * both funnel through here so the seeded shape stays identical; each then either
 * activates the picker overlay or adopts the right-clicked element before
 * `StartAgent` folds in the targets.
 */
export function seedSelectorSession(
  state: SelectorState,
  { tabId, mode, page }: { tabId: number; mode: SelectorMode; page: PageContext }
): string {
  state.setMeta({ tabId });
  const sessionId = crypto.randomUUID();

  state.set({
    schemaVersion: SELECTOR_HISTORY_SCHEMA_VERSION,
    sessionId,
    mode,
    status: "picking",
    page,
    targets: [],
    example: { inspectionView: "", targetElementIds: [] },
    seedCandidates: [],
    messages: [],
    browserRequest: null,
    browserResult: null,
    correctSelectors: [],
  });

  return sessionId;
}
