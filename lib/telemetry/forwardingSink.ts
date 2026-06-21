/**
 * Telemetry sink for the content script and popup. Neither context sends to App
 * Insights directly — the background is the single egress. This sink serializes
 * each item and forwards it over the existing background message protocol.
 *
 * Errors don't survive structuredClone (the messaging transport drops the
 * prototype/stack), so exceptions are normalized to a plain `{name, message,
 * stack}` shape before sending; the background rebuilds them.
 */

import { BackgroundMessageType, backgroundProtocol } from "@/lib/messaging";
import { normalizeError } from "./scrub";
import type {
  ForwardableRole,
  TelemetrySink,
  TrackEventInput,
  TrackExceptionInput,
} from "./types";

/** Build a forwarding sink that tags every item with its originating role. */
export function createForwardingSink(role: ForwardableRole): TelemetrySink {
  const send = (
    type:
      | BackgroundMessageType.TrackTelemetryEvent
      | BackgroundMessageType.TrackTelemetryException,
    data: unknown
  ): void => {
    try {
      void backgroundProtocol.sendMessage(type, data as never).catch(() => {
        // background may be mid-restart; dropping a telemetry item is fine
      });
    } catch {
      // ignore — telemetry must never throw into app logic
    }
  };

  return {
    trackEvent(input: TrackEventInput): void {
      send(BackgroundMessageType.TrackTelemetryEvent, {
        role,
        name: input.name,
        properties: input.properties,
        measurements: input.measurements,
        operationId: input.operationId,
      });
    },

    trackException(input: TrackExceptionInput): void {
      const normalized = normalizeError(input.error);
      send(BackgroundMessageType.TrackTelemetryException, {
        role,
        name: normalized.name,
        message: normalized.message,
        stack: normalized.stack,
        severity: input.severity,
        properties: input.properties,
        measurements: input.measurements,
        operationId: input.operationId,
      });
    },
  };
}
