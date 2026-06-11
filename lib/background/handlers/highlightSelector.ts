import { BackgroundMessageType, ContentMessageType } from "@/lib/messaging";
import type { BackgroundHandler } from "@/lib/background";

export const handleHighlightSelector: BackgroundHandler<
  BackgroundMessageType.HighlightSelector
> = async ({ selector }, { backgroundMessagingClient }) => {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (tab?.id == null) return { matchCount: 0 };

  try {
    return await backgroundMessagingClient.sendMessageToContent(
      tab.id,
      ContentMessageType.HighlightSelector,
      { selector }
    );
  } catch {
    return { matchCount: 0 };
  }
};
