/**
 * The popup's messaging surface. Two halves:
 *
 *   • `toBackground` — outbound intents (start a session, cancel, fetch
 *     bootstrap snapshot).
 *   • `onEvent` — inbound BG-pushed events on the popup protocol (session
 *     updates, settlement). Returns an unsubscribe function so popup teardown
 *     can clean its listeners.
 *
 * This is the small abstraction the popup UI uses; it never touches
 * `chrome.runtime` directly.
 */

import type { GetDataType, GetReturnType } from "@webext-core/messaging";
import {
  type BackgroundProtocolMap,
  type BackgroundMessageType,
  type PopupProtocolMap,
  type PopupMessageType,
  backgroundProtocol,
  popupProtocol,
} from "./protocol";

export interface PopupMessagingClient {
  sendMessageToBackground<K extends BackgroundMessageType>(
    type: K,
    data: GetDataType<BackgroundProtocolMap[K]>
  ): Promise<GetReturnType<BackgroundProtocolMap[K]>>;

  onEvent<K extends PopupMessageType>(
    type: K,
    listener: (data: GetDataType<PopupProtocolMap[K]>) => void
  ): () => void;
}

export function createPopupMessagingClient(): PopupMessagingClient {
  return {
    sendMessageToBackground: ((type, data) =>
      backgroundProtocol.sendMessage(
        type,
        data
      )) as PopupMessagingClient["sendMessageToBackground"],

    onEvent: ((type, listener) => {
      const remove = popupProtocol.onMessage(type, ({ data }) => {
        listener(data as never);
      });
      return remove;
    }) as PopupMessagingClient["onEvent"],
  };
}
