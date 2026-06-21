/**
 * Public telemetry types shared across all three extension contexts. The same
 * `trackEvent` / `trackException` surface (see ./api.ts) is used everywhere; the
 * background sends directly to App Insights while content and popup forward to
 * the background (see ./forwardingSink.ts).
 */

/** App Insights `ai.cloud.role` — distinguishes which context emitted an item. */
export type TelemetryRole =
  | "selector-extension-background"
  | "selector-extension-content"
  | "selector-extension-popup";

/**
 * The roles that forward over the message protocol to the background egress.
 * Background never forwards to itself, so it's excluded — this keeps the wire
 * DTOs from ever claiming the background role.
 */
export type ForwardableRole = Exclude<TelemetryRole, "selector-extension-background">;

/** Maps to App Insights `SeverityLevel` (Warning=2, Error=3, Critical=4). */
export type TelemetrySeverity = "warning" | "error" | "critical";

export interface TrackEventInput {
  /** Event name, e.g. `command.StartAgent` or `agentLoop.completed`. */
  name: string;
  /** String dimensions. Run through the property allow-list before sending. */
  properties?: Record<string, string>;
  /** Numeric metrics (latency, counts). */
  measurements?: Record<string, number>;
  /** Correlation id (e.g. sessionId) → `ai.operation.id`. */
  operationId?: string;
}

export interface TrackExceptionInput {
  error: unknown;
  /** Defaults to `error`. */
  severity?: TelemetrySeverity;
  properties?: Record<string, string>;
  measurements?: Record<string, number>;
  operationId?: string;
}

/**
 * The sink the public API delegates to. The background registers a direct App
 * Insights client; content/popup register a forwarding sink. Fire-and-forget.
 */
export interface TelemetrySink {
  trackEvent(input: TrackEventInput): void;
  trackException(input: TrackExceptionInput): void;
}

/**
 * The role-aware sink the background holds on BackgroundContext. Background calls
 * default the role to background; the forwarding handlers pass the content/popup
 * role through. Implemented by BackgroundTelemetryClient.
 */
export interface BackgroundTelemetry {
  trackEvent(input: TrackEventInput, role?: TelemetryRole): void;
  trackException(input: TrackExceptionInput, role?: TelemetryRole): void;
}
