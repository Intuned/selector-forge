/**
 * Background-side handler registry. Mirrors the existing `registerHandlers`
 * pattern but is keyed off the `BackgroundMessageType` enum and injects the
 * shared `BackgroundContext` (state + agent loop + outbound messaging) into
 * each call.
 *
 * Exhaustiveness is enforced by the `BackgroundHandlers` mapped type — a
 * missing or extra key is a compile error.
 */

import type {
  GetDataType,
  GetReturnType,
  MaybePromise,
} from "@webext-core/messaging";
import {
  BackgroundMessageType,
  backgroundProtocol,
  type BackgroundProtocolMap,
} from "@/lib/messaging";
import type {
  BackgroundContext,
  BackgroundHandlerContext,
  MessageSender,
} from "@/lib/background";

export type BackgroundHandler<K extends BackgroundMessageType> = (
  data: GetDataType<BackgroundProtocolMap[K]>,
  ctx: BackgroundHandlerContext
) => MaybePromise<GetReturnType<BackgroundProtocolMap[K]>>;

export type BackgroundHandlers = {
  [K in BackgroundMessageType]: BackgroundHandler<K>;
};

export function registerBackgroundHandlers(
  handlers: BackgroundHandlers,
  ctx: BackgroundContext
): void {
  const register = backgroundProtocol.onMessage as (
    type: BackgroundMessageType,
    cb: (message: { data: unknown; sender: MessageSender }) => unknown
  ) => void;

  for (const key of Object.values(BackgroundMessageType)) {
    register(key, async (message) => {
      await ctx.state.ready;
      return handlers[key](message.data as never, {
        ...ctx,
        sender: message.sender,
      });
    });
  }
}
