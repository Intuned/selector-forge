import type { Message } from "./messages";

export async function sendMessage(message: Message): Promise<unknown> {
  // stub for sending messages from content script to background, or from popup to background, etc.
  return new Promise((resolve) => {});
}
