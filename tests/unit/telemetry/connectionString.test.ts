import { describe, expect, it } from "vitest";
import { parseConnectionString } from "../../../lib/telemetry/connectionString";

describe("parseConnectionString", () => {
  it("parses key + endpoint and builds the track url", () => {
    const parsed = parseConnectionString(
      "InstrumentationKey=abc-123;IngestionEndpoint=https://westus2-2.in.applicationinsights.azure.com/;LiveEndpoint=https://x/"
    );
    expect(parsed).toEqual({
      instrumentationKey: "abc-123",
      ingestionEndpoint: "https://westus2-2.in.applicationinsights.azure.com",
      trackUrl: "https://westus2-2.in.applicationinsights.azure.com/v2/track",
    });
  });

  it("is order-independent and trims a trailing slash", () => {
    const parsed = parseConnectionString(
      "IngestionEndpoint=https://r.example.com;InstrumentationKey=k1"
    );
    expect(parsed?.instrumentationKey).toBe("k1");
    expect(parsed?.trackUrl).toBe("https://r.example.com/v2/track");
  });

  it("falls back to the default ingestion endpoint when omitted", () => {
    const parsed = parseConnectionString("InstrumentationKey=k2");
    expect(parsed?.ingestionEndpoint).toBe(
      "https://dc.services.visualstudio.com"
    );
  });

  it("returns null without an instrumentation key", () => {
    expect(parseConnectionString("IngestionEndpoint=https://x/")).toBeNull();
    expect(parseConnectionString("")).toBeNull();
  });
});
