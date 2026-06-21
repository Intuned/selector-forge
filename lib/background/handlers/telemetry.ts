/**
 * Background handlers for telemetry forwarded from content/popup. The background
 * is the single App Insights egress; these reconstruct the item (an Error from
 * the flattened `{name, message, stack}`) and hand it to the role-aware client.
 *
 * NOTE: these handlers are intentionally NOT wrapped by the command-event
 * instrumentation in registerHandlers — that would emit telemetry about
 * telemetry. See `TELEMETRY_MESSAGE_TYPES` there.
 */

import { BackgroundMessageType } from "@/lib/messaging";
import type { BackgroundHandler } from "@/lib/background";

export const handleTrackTelemetryEvent: BackgroundHandler<
  BackgroundMessageType.TrackTelemetryEvent
> = (data, ctx) => {
  ctx.telemetry.trackEvent(
    {
      name: data.name,
      properties: data.properties,
      measurements: data.measurements,
      operationId: data.operationId,
    },
    data.role
  );
};

export const handleTrackTelemetryException: BackgroundHandler<
  BackgroundMessageType.TrackTelemetryException
> = (data, ctx) => {
  const error = new Error(data.message);
  error.name = data.name;
  if (data.stack) error.stack = data.stack;
  ctx.telemetry.trackException(
    {
      error,
      severity: data.severity,
      properties: data.properties,
      measurements: data.measurements,
      operationId: data.operationId,
    },
    data.role
  );
};
