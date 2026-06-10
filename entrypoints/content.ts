import {
  contentHandlers,
  PickerSession,
  registerContentHandlers,
  type ContentContext,
} from "@/lib/content";
import { createContentMessagingClient } from "@/lib/messaging";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main: () => {
    const picker = new PickerSession();
    const contentMessagingClient = createContentMessagingClient();
    const context: ContentContext = { picker, contentMessagingClient };

    registerContentHandlers(contentHandlers, context);
  },
});
