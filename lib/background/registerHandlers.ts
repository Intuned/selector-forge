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

/**
 * Telemetry-forwarding messages are excluded from command instrumentation —
 * tracking them would emit telemetry about telemetry (and recurse on failure).
 */
const TELEMETRY_MESSAGE_TYPES: ReadonlySet<BackgroundMessageType> = new Set([
  BackgroundMessageType.TrackTelemetryEvent,
  BackgroundMessageType.TrackTelemetryException,
]);

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
      const handlerCtx = { ...ctx, sender: message.sender };
      const data = message.data as never;

      if (TELEMETRY_MESSAGE_TYPES.has(key)) {
        return handlers[key](data, handlerCtx);
      }

      // One choke point instruments every command: duration + success event,
      // or an exception (then re-thrown so behavior is unchanged).
      const startedAt = Date.now();
      try {
        const result = await handlers[key](data, handlerCtx);
        ctx.telemetry.trackEvent({
          name: `command.${key}`,
          measurements: { durationMs: Date.now() - startedAt },
          operationId: ctx.state.get()?.sessionId,
        });
        return result;
      } catch (error) {
        ctx.telemetry.trackException({
          error,
          properties: { command: key },
          operationId: ctx.state.get()?.sessionId,
        });
        throw error;
      }
    });
  }
}
