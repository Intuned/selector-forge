import { BackgroundMessageType, ContentMessageType } from "@/lib/messaging";
import { SELECTOR_HISTORY_SCHEMA_VERSION, saveLastMode } from "@/lib/state";
import type { BackgroundHandler } from "@/lib/background";

export const handleStartPickerSession: BackgroundHandler<
  BackgroundMessageType.StartPickerSession
> = async (
  { mode, page },
  { state, backgroundMessagingClient, sender, agentLoopController }
) => {
  // Abort any in-flight loop from a previous session.
  agentLoopController.cancel();

  let tabId = sender?.tab?.id ?? null;
  if (tabId == null) {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    tabId = tab?.id ?? null;
  }
  if (tabId == null) {
    throw new Error("No active tab to start a selector session in");
  }


  await saveLastMode(mode);

  state.setMeta({ tabId });
  const sessionId = crypto.randomUUID();

  // initial state for the selector session
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

  await backgroundMessagingClient.sendMessageToContent(
    tabId,
    ContentMessageType.ActivatePicker,
    { sessionId, mode, status: "picking", targets: [] }
  );

  return { sessionId };
};
