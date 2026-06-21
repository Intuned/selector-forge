const DEFAULT_API_BASE = "https://app.intuned.io";
export const GRAPHQL_API = "https://metricsshop.hasura.app/v1/graphql";
const API_BASE_OVERRIDE_KEY = "config.apiBase";

/* ───────────────────────── telemetry (App Insights) ─────────────────────── */

/** Storage keys for telemetry config. Mirrors the `config.apiBase` override pattern. */
export const TELEMETRY_ENABLED_KEY = "config.telemetryEnabled";
const TELEMETRY_CONNECTION_STRING_OVERRIDE_KEY =
  "config.appInsightsConnectionString";
const TELEMETRY_INSTALL_ID_KEY = "telemetry.installId";

/**
 * Hard-coded App Insights connection string (temporary). Currently points at the
 * shared web resource (cloud role `selector-extension-*` distinguishes it); swap
 * for a dedicated `selector-extension` resource later. The write-only ingestion
 * key is safe to ship in the bundle.
 *
 * NOTE: the IngestionEndpoint region here is coupled to `appInsightsHost` in
 * wxt.config.ts (host_permissions). If you change the region, update that entry
 * in lockstep or the worker's POST will be blocked.
 */
const HARDCODED_CONNECTION_STRING =
  "InstrumentationKey=b042659b-fcc8-403f-ba01-0207fdbb6506;IngestionEndpoint=https://westus2-2.in.applicationinsights.azure.com/;LiveEndpoint=https://westus2.livediagnostics.monitor.azure.com/";

/**
 * Resolve the App Insights connection string: a `browser.storage.local` override
 * (set for dev/e2e to point at a throwaway resource) wins over the hard-coded
 * value. Returns `null` only if both are empty, which disables telemetry.
 */
export async function getTelemetryConnectionString(): Promise<string | null> {
  const out = await browser.storage.local.get(
    TELEMETRY_CONNECTION_STRING_OVERRIDE_KEY
  );
  const override = out[TELEMETRY_CONNECTION_STRING_OVERRIDE_KEY];
  if (typeof override === "string" && override) return override;
  return HARDCODED_CONNECTION_STRING || null;
}

export async function setTelemetryConnectionStringOverride(
  connectionString: string | null
): Promise<void> {
  if (connectionString) {
    await browser.storage.local.set({
      [TELEMETRY_CONNECTION_STRING_OVERRIDE_KEY]: connectionString,
    });
  } else {
    await browser.storage.local.remove(
      TELEMETRY_CONNECTION_STRING_OVERRIDE_KEY
    );
  }
}

/** Whether the user has opted into telemetry. Defaults to enabled. */
export async function getTelemetryEnabled(): Promise<boolean> {
  const out = await browser.storage.local.get(TELEMETRY_ENABLED_KEY);
  return out[TELEMETRY_ENABLED_KEY] !== false;
}

export async function setTelemetryEnabled(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ [TELEMETRY_ENABLED_KEY]: enabled });
}

/**
 * A stable, anonymous per-install id used as `ai.user.id` so sessions and errors
 * can be correlated across the worker's lifetimes without any PII. Generated once
 * and persisted; never derived from the signed-in identity.
 */
export async function getInstallId(): Promise<string> {
  const out = await browser.storage.local.get(TELEMETRY_INSTALL_ID_KEY);
  const existing = out[TELEMETRY_INSTALL_ID_KEY];
  if (typeof existing === "string" && existing) return existing;
  const id = crypto.randomUUID();
  await browser.storage.local.set({ [TELEMETRY_INSTALL_ID_KEY]: id });
  return id;
}

export async function getApiBase(): Promise<string> {
  const out = await browser.storage.local.get(API_BASE_OVERRIDE_KEY);
  const value = out[API_BASE_OVERRIDE_KEY];
  return typeof value === "string" && value ? value : DEFAULT_API_BASE;
}

export async function setApiBaseOverride(url: string | null): Promise<void> {
  if (url) {
    await browser.storage.local.set({ [API_BASE_OVERRIDE_KEY]: url });
  } else {
    await browser.storage.local.remove(API_BASE_OVERRIDE_KEY);
  }
}

export async function getSelectorCreateUrl(): Promise<string> {
  const apiBase = await getApiBase();
  return `${apiBase}/api/selectors/create`;
}

export async function getSelectorFeedbackUrl(): Promise<string> {
  const apiBase = await getApiBase();
  return `${apiBase}/api/selectors/feedback`;
}

export async function getSettingsUrl(): Promise<string> {
  const apiBase = await getApiBase();
  return `${apiBase}/settings/workspace`;
}

export async function getApiKeysUrl(): Promise<string> {
  const apiBase = await getApiBase();
  return `${apiBase}/settings/api-keys`;
}
