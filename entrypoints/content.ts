import {
  contentHandlers,
  ContextMenuTracker,
  PickerSession,
  registerContentHandlers,
  type ContentContext,
} from "@/lib/content";
import { createContentMessagingClient } from "@/lib/messaging";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main: () => {
    const contextMenu = new ContextMenuTracker();
    contextMenu.addContextMenuListener();
    const picker = new PickerSession(contextMenu);
    const contentMessagingClient = createContentMessagingClient();
    const context: ContentContext = { picker, contentMessagingClient };

    registerContentHandlers(contentHandlers, context);
  },
});
