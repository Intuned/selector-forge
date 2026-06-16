import type { BackgroundMessageType } from "@/lib/messaging";
import { saveLastMode } from "@/lib/state";
import type { BackgroundHandler } from "@/lib/background";
import { seedAndActivateSession } from "./startSessionCore";

export const handleStartPickerSession: BackgroundHandler<
  BackgroundMessageType.StartPickerSession
> = async ({ mode, page }, ctx) => {
  let tabId = ctx.sender?.tab?.id ?? null;
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

  // Remember the popup-selected mode so the popup defaults to it next time.
  // The CLI bridge path (startPickerSessionForTab) deliberately skips this —
  // programmatic sessions shouldn't override the user's remembered choice.
  await saveLastMode(mode);

  const { sessionId } = await seedAndActivateSession({ mode, page, tabId }, ctx);
  return { sessionId };
};
