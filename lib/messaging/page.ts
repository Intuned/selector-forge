import { defineWindowMessaging } from "@webext-core/messaging/page";
import type { PickMode } from "../types";

/**
 * Messaging between the content script and the in-page picker (MAIN world) over
 * window.postMessage. The picker can't use `browser.runtime`, so a content script
 * must bridge these to the background (TODO: bridge not built yet).
 */
export interface PageProtocolMap {
  /** content -> page: start picking. */
  startPick(data: PickMode): void;
  /** page -> content: a selector was produced. */
  selectorResult(data: { selector: string; body?: unknown }): void;
}

export const pageMessenger = defineWindowMessaging<PageProtocolMap>({
  // Both ends must share this. Bump on an incompatible protocol change.
  namespace: "intuned.selector.page.v1",
});
