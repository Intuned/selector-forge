import {
  defineExtensionMessaging,
  type ExtensionMessage,
  type GetDataType,
  type GetReturnType,
  type MaybePromise,
} from "@webext-core/messaging";
import type { AuthState } from "../auth";
import type { PickMode } from "../types";

/** Result of a startPick request. */
export interface StartPickResult {
  ok: boolean;
  error?: string;
}

/** Every popup/content-script -> background message, as `name(data?): Return`. */
export interface ExtensionProtocolMap {
  startPick(data: PickMode): StartPickResult;
  selectorRequest(data: { body: unknown }): void;
  openPopup(): void;
  initializeAuth(): AuthState;
  signIn(): void;
  setApiKey(data: { apiKey: string; workspaceId: string }): AuthState;
  signOut(): AuthState;
}

export const { sendMessage, onMessage } =
  defineExtensionMessaging<ExtensionProtocolMap>();

type MessageSender = ExtensionMessage["sender"];

/** Handler for one message: its data + sender in, its result out. */
export type Handler<TKey extends keyof ExtensionProtocolMap> = (
  data: GetDataType<ExtensionProtocolMap[TKey]>,
  sender: MessageSender,
) => MaybePromise<GetReturnType<ExtensionProtocolMap[TKey]>>;

/** One handler per message — a missing or extra key is a compile error. */
export type ExtensionHandlers = {
  [K in keyof ExtensionProtocolMap]: Handler<K>;
};

/** Wires up every handler. Call once from the background. */
export function registerHandlers(handlers: ExtensionHandlers): void {
  // Looping over the key union widens onMessage's per-key types; exhaustiveness
  // is already enforced on `handlers`, so a loose cast here is safe.
  const register = onMessage as (
    type: keyof ExtensionProtocolMap,
    cb: (message: { data: unknown; sender: MessageSender }) => unknown,
  ) => void;

  for (const key of Object.keys(handlers) as (keyof ExtensionProtocolMap)[]) {
    register(key, (message) => handlers[key](message.data as never, message.sender));
  }
}
