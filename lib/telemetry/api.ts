/**
 * The public telemetry surface, imported uniformly by every context. It
 * delegates to a registered sink: the background registers the direct App
 * Insights client (see ./client.ts); content and popup register a forwarding
 * sink (see ./forwardingSink.ts) during their entrypoint setup. Until a sink is
 * registered — and in tests — every call is a safe no-op.
 *
 * Both functions are fire-and-forget and swallow errors: telemetry must never
 * throw into application logic.
 */

import type { TelemetrySink, TrackEventInput, TrackExceptionInput } from "./types";

let sink: TelemetrySink | null = null;

/** Register the active sink for this context. Call once during entry setup. */
export function setTelemetrySink(next: TelemetrySink | null): void {
  sink = next;
}

export function trackEvent(input: TrackEventInput): void {
  try {
    sink?.trackEvent(input);
  } catch {
    // ignore
  }
}

export function trackException(input: TrackExceptionInput): void {
  try {
    sink?.trackException(input);
  } catch {
    // ignore
  }
}
