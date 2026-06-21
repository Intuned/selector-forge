import {
  contentHandlers,
  ContextMenuTracker,
  PickerSession,
  registerContentHandlers,
  type ContentContext,
} from "@/lib/content";
import { createContentMessagingClient } from "@/lib/messaging";
import { setTelemetrySink } from "@/lib/telemetry/api";
import { createForwardingSink } from "@/lib/telemetry/forwardingSink";
import { reportGlobalErrors } from "@/lib/telemetry/globalErrors";

// A content script shares the page's `window`, so its error listeners also fire
// for host-page errors. Gate on the extension origin so we only report our own.
const EXTENSION_ORIGIN = /(?:chrome|moz)-extension:\/\//;
function isExtensionError(error: unknown, filename?: string): boolean {
  if (filename && EXTENSION_ORIGIN.test(filename)) return true;
  return error instanceof Error && !!error.stack && EXTENSION_ORIGIN.test(error.stack);
}

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main: () => {
    setTelemetrySink(createForwardingSink("selector-extension-content"));

    const contextMenu = new ContextMenuTracker();
    contextMenu.addContextMenuListener();
    const picker = new PickerSession(contextMenu);
    const contentMessagingClient = createContentMessagingClient();
    const context: ContentContext = { picker, contentMessagingClient };

    registerContentHandlers(contentHandlers, context);

    reportGlobalErrors(window, isExtensionError);
  },
});
