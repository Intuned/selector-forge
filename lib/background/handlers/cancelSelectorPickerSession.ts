import { BackgroundMessageType, ContentMessageType } from "@/lib/messaging";
import { clearLastMode } from "@/lib/state";
import type { BackgroundHandler } from "@/lib/background";

export const handleCancelPickerSession: BackgroundHandler<
  BackgroundMessageType.CancelPickerSession
> = async (
  { sessionId },
  { state, agentLoopController, backgroundMessagingClient, sender, viaBridge }
) => {
  const current = state.get();
  if (current && current.sessionId !== sessionId) {
    return;
  }

  const tabId = sender?.tab?.id ?? state.getMeta()?.tabId ?? null;

  agentLoopController.cancel();
  state.clear();

  // `lastMode` is a popup-only preference (saved only by the popup start path).
  // Don't let a programmatic (CLI) cancel reset it — only UI-initiated cancels
  // should, mirroring who sets it.
  if (!viaBridge) {
    await clearLastMode();
  }

  if (tabId != null) {
    try {
      await backgroundMessagingClient.sendMessageToContent(
        tabId,
        ContentMessageType.DeactivatePicker,
        { sessionId }
      );
    } catch {
      // content script may already be gone (tab navigated/closed).
    }
  }

  // Returning the user to the popup is a UI affordance; skip it for
  // programmatic (CLI) cancels, which have no user to surface it to.
  if (!viaBridge) {
    try {
      await browser.action.openPopup();
    } catch (error) {
      console.debug(
        "[selector-extension] openPopup not allowed on cancel",
        error
      );
    }
  }
};
