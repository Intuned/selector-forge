/**
 * Parse an App Insights connection string into the fields the bare
 * `AppInsightsCore` needs. The umbrella `ApplicationInsights` class parses the
 * connection string for you, but the core does not — it requires an explicit
 * instrumentation key and endpoint. The format is a simple `k=v;k=v` string:
 *
 *   InstrumentationKey=<guid>;IngestionEndpoint=https://<region>.in.applicationinsights.azure.com/;...
 */

export interface ParsedConnectionString {
  instrumentationKey: string;
  /** Ingestion origin without a trailing slash, e.g. https://westus2-2.in.applicationinsights.azure.com */
  ingestionEndpoint: string;
  /** Full track URL the Sender should POST to. */
  trackUrl: string;
}

const DEFAULT_INGESTION_ENDPOINT = "https://dc.services.visualstudio.com";

export function parseConnectionString(
  connectionString: string
): ParsedConnectionString | null {
  const map: Record<string, string> = {};
  for (const part of connectionString.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim().toLowerCase();
    map[key] = trimmed.slice(eq + 1).trim();
  }

  const instrumentationKey = map["instrumentationkey"];
  if (!instrumentationKey) return null;

  const ingestionEndpoint = (
    map["ingestionendpoint"] || DEFAULT_INGESTION_ENDPOINT
  ).replace(/\/+$/, "");

  return {
    instrumentationKey,
    ingestionEndpoint,
    trackUrl: `${ingestionEndpoint}/v2/track`,
  };
}
