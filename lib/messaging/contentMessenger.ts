/**
 * Outbound messaging client used by content-script handlers and DOM modules
 * to push intents to the background. Strongly typed via the background
 * protocol map: payload + response are inferred from the message type.
 */

import type { GetDataType, GetReturnType } from "@webext-core/messaging";
import {
  type BackgroundProtocolMap,
  type BackgroundMessageType,
  backgroundProtocol,
} from "./protocol";

export interface ContentMessagingClient {
  sendMessageToBackground<K extends BackgroundMessageType>(
    type: K,
    data: GetDataType<BackgroundProtocolMap[K]>
  ): Promise<GetReturnType<BackgroundProtocolMap[K]>>;
}

export function createContentMessagingClient(): ContentMessagingClient {
  return {
    sendMessageToBackground: ((type, data) =>
      backgroundProtocol.sendMessage(
        type,
        data
      )) as ContentMessagingClient["sendMessageToBackground"],
  };
}
