import { BackgroundMessageType, ContentMessageType } from "@/lib/messaging";
import { clearLastMode } from "@/lib/state";
import type { BackgroundHandler } from "@/lib/background";

export const handleCancelPickerSession: BackgroundHandler<
  BackgroundMessageType.CancelPickerSession
> = async (
  { sessionId },
  { state, agentLoopController, backgroundMessagingClient, sender }
) => {
  const tabId = sender?.tab?.id ?? state.getMeta()?.tabId ?? null;

  agentLoopController.cancel();
  state.clear();

  await clearLastMode();

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

  try {
    await browser.action.openPopup();
  } catch (error) {
    console.debug(
      "[selector-extension] openPopup not allowed on cancel",
      error
    );
  }
};
