/**
 * Background-only App Insights client. Builds the SDK pipeline from the core +
 * channel directly — deliberately NOT the `ApplicationInsights` umbrella class
 * or `loadAppInsights()`, which wire up DOM auto-collectors (page views, ajax,
 * history) that reach for `window`/`document` and crash in an MV3 service
 * worker. With no extensions array there is no DOM auto-collection; we hand the
 * core only the `Sender`, configured for the worker (fetch transport, in-memory
 * buffer, no beacon).
 *
 * This is the single telemetry egress: content and popup forward their items
 * here via messaging (see ./forwardingSink.ts and the background handlers).
 */

import {
  AppInsightsCore,
  type IConfiguration,
  type ITelemetryItem,
} from "@microsoft/applicationinsights-core-js";
import { Sender } from "@microsoft/applicationinsights-channel-js";
import {
  Event as AiEvent,
  Exception as AiException,
  TelemetryItemCreator,
} from "@microsoft/applicationinsights-common";
import {
  getInstallId,
  getTelemetryConnectionString,
  getTelemetryEnabled,
  TELEMETRY_ENABLED_KEY,
} from "@/lib/config";
import { parseConnectionString } from "./connectionString";
import {
  normalizeError,
  sanitizeMeasurements,
  sanitizeProperties,
  type NormalizedError,
} from "./scrub";
import type {
  BackgroundTelemetry,
  TelemetryRole,
  TelemetrySeverity,
  TrackEventInput,
  TrackExceptionInput,
} from "./types";

const BACKGROUND_ROLE: TelemetryRole = "selector-extension-background";

// App Insights SeverityLevel: Warning=2, Error=3, Critical=4.
const SEVERITY: Record<TelemetrySeverity, number> = {
  warning: 2,
  error: 3,
  critical: 4,
};

/**
 * App Insights types `ITelemetryItem.tags` as the awkward `Tags & Tags[]`.
 * Treat it as a plain string map (which is how the SDK's own initializers use
 * it — see `envelope.tags["ai.cloud.role"] = ...`).
 */
function tagsOf(item: ITelemetryItem): Record<string, string | undefined> {
  if (!item.tags) {
    item.tags = {} as ITelemetryItem["tags"];
  }
  return item.tags as unknown as Record<string, string | undefined>;
}

/** Rebuild an Error from a normalized shape so the SDK can parse its stack. */
function toError(normalized: NormalizedError): Error {
  const err = new Error(normalized.message);
  err.name = normalized.name;
  if (normalized.stack) err.stack = normalized.stack;
  return err;
}

let cachedVersion: string | undefined;
/** Extension version from the manifest (`ai.application.ver`), cached. */
function appVersion(): string {
  if (cachedVersion === undefined) {
    try {
      cachedVersion = browser.runtime.getManifest().version;
    } catch {
      cachedVersion = "unknown";
    }
  }
  return cachedVersion;
}

export class BackgroundTelemetryClient implements BackgroundTelemetry {
  private core: AppInsightsCore | null = null;
  private enabled = true;
  private installId = "";

  /**
   * Resolve config and stand up the core + sender. A no-op (leaves `core` null)
   * when no connection string is configured. The connection string is currently
   * always present (a hard-coded value in lib/config), so in practice this only
   * no-ops when the value is unparseable or a storage override clears it. Never
   * throws — an init failure is logged and leaves telemetry disabled. Safe to
   * call once at worker startup.
   */
  async init(): Promise<void> {
    try {
      const connectionString = await getTelemetryConnectionString();
      if (!connectionString) {
        console.debug(
          "[selector-extension] telemetry disabled: no connection string"
        );
        return;
      }

      // The bare core (unlike the umbrella ApplicationInsights class) does not
      // parse a connection string — it needs an explicit key + endpoint.
      const parsed = parseConnectionString(connectionString);
      if (!parsed) {
        console.debug(
          "[selector-extension] telemetry disabled: unparseable connection string"
        );
        return;
      }

      this.enabled = await getTelemetryEnabled();
      this.installId = await getInstallId();

      const sender = new Sender();
      const core = new AppInsightsCore();
      const config: IConfiguration = {
        instrumentationKey: parsed.instrumentationKey,
        endpointUrl: parsed.trackUrl,
        disableInstrumentationKeyValidation: true,
        extensionConfig: {
          [sender.identifier]: {
            endpointUrl: parsed.trackUrl,
            // Service-worker constraints: no XMLHttpRequest, no sessionStorage,
            // and sendBeacon is unavailable — force the fetch sender + in-memory
            // buffer, and keep the batch window short so items flush before the
            // worker is suspended (~30s idle).
            disableXhr: true,
            enableSessionStorageBuffer: false,
            isBeaconApiDisabled: true,
            maxBatchInterval: 5000,
          },
        },
      };
      core.initialize(config, [sender]);

      const ver = appVersion();
      const installId = this.installId;
      core.addTelemetryInitializer((item: ITelemetryItem) => {
        const tags = tagsOf(item);
        // Per-item role (set by stamp() for forwarded content/popup items) wins;
        // otherwise default to background.
        tags["ai.cloud.role"] = tags["ai.cloud.role"] ?? BACKGROUND_ROLE;
        tags["ai.application.ver"] = ver;
        tags["ai.user.id"] = installId;
        return true;
      });

      this.core = core;

      // Respect the opt-out toggle live, without a restart.
      browser.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes[TELEMETRY_ENABLED_KEY]) {
          this.enabled = changes[TELEMETRY_ENABLED_KEY].newValue !== false;
        }
      });
    } catch (error) {
      // Telemetry must never throw into app logic — a broken init just leaves
      // `core` null (disabled). Log a breadcrumb so the blackout is diagnosable
      // rather than completely silent.
      console.debug("[selector-extension] telemetry init failed", error);
    }
  }

  trackEvent(input: TrackEventInput, role: TelemetryRole = BACKGROUND_ROLE): void {
    this.safe(() => {
      if (!this.ready()) return;
      const props = sanitizeProperties(input.properties);
      const event = new AiEvent(
        this.core!.logger,
        input.name,
        props,
        sanitizeMeasurements(input.measurements)
      );
      const item = TelemetryItemCreator.create(
        event,
        AiEvent.dataType,
        AiEvent.envelopeType,
        this.core!.logger,
        props
      );
      this.stamp(item, role, input.operationId);
      this.core!.track(item);
    });
  }

  trackException(
    input: TrackExceptionInput,
    role: TelemetryRole = BACKGROUND_ROLE
  ): void {
    this.safe(() => {
      if (!this.ready()) return;
      const props = sanitizeProperties(input.properties);
      const error = toError(normalizeError(input.error));
      const exception = new AiException(
        this.core!.logger,
        error,
        props,
        sanitizeMeasurements(input.measurements),
        SEVERITY[input.severity ?? "error"]
      );
      const item = TelemetryItemCreator.create(
        exception,
        AiException.dataType,
        AiException.envelopeType,
        this.core!.logger,
        props
      );
      this.stamp(item, role, input.operationId);
      this.core!.track(item);
    });
    // Exceptions are low-volume and the most-losable under SW suspend — flush now.
    void this.flush();
  }

  /** Force a send. Called internally after exceptions; also used by tests. */
  async flush(): Promise<void> {
    try {
      this.core?.flush(true);
    } catch {
      // never let a flush failure surface into app logic
    }
  }

  private ready(): boolean {
    return this.core != null && this.enabled;
  }

  private stamp(
    item: ITelemetryItem,
    role: TelemetryRole,
    operationId?: string
  ): void {
    const tags = tagsOf(item);
    tags["ai.cloud.role"] = role;
    if (operationId) tags["ai.operation.id"] = operationId;
  }

  private safe(fn: () => void): void {
    try {
      fn();
    } catch (error) {
      try {
        console.debug("[selector-extension] telemetry track failed", error);
      } catch {
        // ignore — telemetry must never throw into app logic
      }
    }
  }
}
