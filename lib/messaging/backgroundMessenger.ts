/**
 * The background worker's outbound messaging client. Hands handlers two
 * destination-scoped sender functions:
 *
 *   • `toContent(tabId, type, data)` — dispatches to the content script in a
 *     specific tab, awaits its response.
 *   • `toPopup(type, data)` — fire-and-forget broadcast; the popup may not be
 *     open, in which case the promise resolves to `undefined`.
 *
 * The two helpers are intentionally separate (rather than a polymorphic
 * `send`) so handler code reads as a clear directive: "ask the page to test
 * these selectors" vs "tell the popup the session settled".
 */

import type {
  GetDataType,
  GetReturnType,
  MaybePromise,
} from "@webext-core/messaging";
import {
  type ContentProtocolMap,
  type ContentMessageType,
  type PopupProtocolMap,
  type PopupMessageType,
  contentProtocol,
  popupProtocol,
} from "./protocol";

export interface BackgroundMessagingClient {
  sendMessageToContent<K extends ContentMessageType>(
    tabId: number,
    type: K,
    data: GetDataType<ContentProtocolMap[K]>
  ): Promise<GetReturnType<ContentProtocolMap[K]>>;

  sendMessageToPopup<K extends PopupMessageType>(
    type: K,
    data: GetDataType<PopupProtocolMap[K]>
  ): Promise<GetReturnType<PopupProtocolMap[K]> | undefined>;
}

export function createBackgroundMessagingClient(): BackgroundMessagingClient {
  return {
    sendMessageToContent: ((tabId, type, data) =>
      contentProtocol.sendMessage(
        type,
        data,
        tabId
      )) as BackgroundMessagingClient["sendMessageToContent"],

    // Popup may be closed — swallow the runtime error so callers don't need
    // to branch. Treat absence as "nobody listening".
    sendMessageToPopup: (async (type, data) => {
      try {
        return (await popupProtocol.sendMessage(
          type,
          data
        )) as MaybePromise<unknown>;
      } catch {
        return undefined;
      }
    }) as BackgroundMessagingClient["sendMessageToPopup"],
  };
}
