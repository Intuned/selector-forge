import { BackgroundMessageType, ContentMessageType } from "@/lib/messaging";
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
};
