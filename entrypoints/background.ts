import type { Message } from "../lib/messaging/messages";

// background service worker
export default defineBackground(() => {
  browser.runtime.onMessage.addListener(
    (raw: unknown, _sender, sendResponse): boolean | undefined => {
      const message = raw as Message;
      switch (message?.type) {
        case "START_PICK":
          void handleStartPick(message.mode).then(sendResponse);
          return true; // keep channel open

        case "SELECTOR_REQUEST":
          return true;

        case "OPEN_POPUP":
          return false;
      }
      return undefined;
    }
  );
});

async function handleStartPick(
  mode: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
