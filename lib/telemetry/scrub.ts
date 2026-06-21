/**
 * Privacy scrubbing for telemetry. The guiding rule: send shapes and counts,
 * never content. No page URLs/titles, selector strings, element HTML, or any
 * signed-in identity. Everything here is defensive — call sites already avoid
 * PII, but this is the last line before an item reaches App Insights.
 */

/** A normalized, transport-safe error (Errors don't survive structuredClone). */
export interface NormalizedError {
  name: string;
  message: string;
  stack?: string;
}

// chrome-extension://<32-char id>/ and moz-extension://<uuid>/ → stable token so
// stacks group cleanly and never leak the per-install extension origin.
const EXTENSION_URL = /(?:chrome|moz)-extension:\/\/[^/\s)]+\//gi;

/** Collapse extension-origin prefixes in arbitrary text (messages, stacks). */
export function collapseExtensionUrls(text: string): string {
  return text.replace(EXTENSION_URL, "extension://");
}

/** Reduce a URL to its host only — drops path, query, and hash. */
export function scrubUrlToHost(raw: string): string {
  try {
    return new URL(raw).host;
  } catch {
    return "invalid-url";
  }
}

/** Normalize any thrown value into a transport-safe, scrubbed shape. */
export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: collapseExtensionUrls(error.message || ""),
      stack: error.stack ? collapseExtensionUrls(error.stack) : undefined,
    };
  }
  if (typeof error === "string") {
    return { name: "Error", message: collapseExtensionUrls(error) };
  }
  let message = "Unknown error";
  try {
    message = collapseExtensionUrls(JSON.stringify(error) ?? message);
  } catch {
    // non-serializable — keep the default
  }
  return { name: "NonError", message };
}

/**
 * Allow-list of property keys that may be sent. Anything else is dropped before
 * it reaches App Insights — adding a new dimension is a conscious privacy
 * decision. Keep this in sync with the instrumentation hook points.
 */
export const ALLOWED_PROPERTY_KEYS: ReadonlySet<string> = new Set([
  "command", // background message type name
  "outcome", // agent-loop result status
  "mode", // selector mode (single/list)
  "status", // generic status string (e.g. auth result "ok"/"failed")
  "statusCode", // HTTP status
  "host", // API host
  "pathname", // API pathname (no query)
  "ok", // HTTP ok boolean (stringified)
  "method", // HTTP method
  "authMethod", // api-key | session
  "source", // where an event originated (e.g. "global", "errorBoundary")
  "context", // free-form short context label
]);

const MAX_PROPERTY_LENGTH = 8192;

/**
 * Coerce values to strings, collapse extension URLs, cap length, and drop any
 * key not in the allow-list. Returns `undefined` when nothing survives so the
 * SDK omits an empty properties bag.
 */
export function sanitizeProperties(
  properties: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!properties) return undefined;
  const out: Record<string, string> = {};
  let kept = 0;
  for (const [key, value] of Object.entries(properties)) {
    if (!ALLOWED_PROPERTY_KEYS.has(key)) continue;
    if (value == null) continue;
    const str = collapseExtensionUrls(String(value)).slice(0, MAX_PROPERTY_LENGTH);
    out[key] = str;
    kept++;
  }
  return kept > 0 ? out : undefined;
}

/** Keep only finite numeric measurements. */
export function sanitizeMeasurements(
  measurements: Record<string, number> | undefined
): Record<string, number> | undefined {
  if (!measurements) return undefined;
  const out: Record<string, number> = {};
  let kept = 0;
  for (const [key, value] of Object.entries(measurements)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
      kept++;
    }
  }
  return kept > 0 ? out : undefined;
}
