import { BackgroundMessageType, ContentMessageType } from "@/lib/messaging";
import type { ContentHandler } from "@/lib/content";

export const handleActivatePicker: ContentHandler<
  ContentMessageType.ActivatePicker
> = async (
  { sessionId, mode, status, targets },
  { picker, contentMessagingClient }
) =>
  picker.activatePicker(
    { mode, status, targets },
    {
      onSubmit: ({ targets, inspectionView, mode }) => {
        void contentMessagingClient.sendMessageToBackground(
          BackgroundMessageType.StartAgent,
          { sessionId, targets, inspectionView, mode }
        );
      },
      onCancel: () => {
        void contentMessagingClient.sendMessageToBackground(
          BackgroundMessageType.CancelPickerSession,
          { sessionId }
        );
      },
    }
  );
