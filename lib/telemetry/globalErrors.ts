/**
 * Wires a context's global `error` / `unhandledrejection` events to telemetry as
 * `source: "global"` exceptions. Used by all three entrypoints (background uses
 * `self`, content/popup use `window`); the content script passes an `isReportable`
 * filter so it ignores host-page errors that share its `window`.
 */

import { trackException } from "./api";

/** Attach global error + unhandled-rejection reporting to a window/worker scope. */
export function reportGlobalErrors(
  target: EventTarget,
  isReportable?: (error: unknown, filename?: string) => boolean
): void {
  target.addEventListener("error", (event) => {
    const e = event as ErrorEvent;
    if (isReportable && !isReportable(e.error, e.filename)) return;
    trackException({
      error: e.error ?? e.message,
      properties: { source: "global" },
    });
  });
  target.addEventListener("unhandledrejection", (event) => {
    const e = event as PromiseRejectionEvent;
    if (isReportable && !isReportable(e.reason)) return;
    trackException({ error: e.reason, properties: { source: "global" } });
  });
}
