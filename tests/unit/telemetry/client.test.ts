import { fakeBrowser } from "@webext-core/fake-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppInsightsCore } from "@microsoft/applicationinsights-core-js";
import { BackgroundTelemetryClient } from "../../../lib/telemetry/client";
import {
  setTelemetryConnectionStringOverride,
  setTelemetryEnabled,
} from "../../../lib/config";
import * as config from "../../../lib/config";

const IKEY = "00000000-0000-0000-0000-000000000001";
const ENDPOINT = "https://test.in.applicationinsights.azure.com";
const CONNECTION_STRING = `InstrumentationKey=${IKEY};IngestionEndpoint=${ENDPOINT}/`;

type FetchCall = { url: string; body: string };

// The AI channel's fetch sender calls `fetch(new Request(url, {body}))`, so the
// first arg is a Request. Read both shapes, and only record the call once the
// body is read so `calls` is ready to assert on as soon as it has the entry.
function stubFetch(): { calls: FetchCall[]; mock: ReturnType<typeof vi.fn> } {
  const calls: FetchCall[] = [];
  const mock = vi.fn(async (input: unknown, init: RequestInit = {}) => {
    let url: string;
    let body: string;
    if (input instanceof Request) {
      url = input.url;
      body = await input.clone().text();
    } else {
      url = String(input);
      body = typeof init.body === "string" ? init.body : "";
    }
    calls.push({ url, body });
    return new Response(
      JSON.stringify({ itemsReceived: 1, itemsAccepted: 1, errors: [] }),
      { status: 200 }
    );
  });
  vi.stubGlobal("fetch", mock);
  return { calls, mock };
}

async function waitForCalls(
  calls: FetchCall[],
  n = 1,
  timeoutMs = 2000
): Promise<void> {
  const start = Date.now();
  while (calls.length < n) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`fetch recorded ${calls.length}/${n} within ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** Parse the App Insights ingestion payload (JSON array or newline-delimited). */
function parseEnvelopes(body: string): any[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return trimmed
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}

function allEnvelopes(calls: FetchCall[]): any[] {
  return calls.flatMap((c) => parseEnvelopes(c.body));
}

describe("BackgroundTelemetryClient", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends an exception envelope with the right iKey, role, and shape", async () => {
    const { calls } = stubFetch();
    await setTelemetryConnectionStringOverride(CONNECTION_STRING);

    const client = new BackgroundTelemetryClient();
    await client.init();
    client.trackException({
      error: new Error("boom"),
      severity: "error",
      operationId: "sess-1",
    });

    await waitForCalls(calls, 1);

    expect(calls[0].url).toContain(ENDPOINT);
    expect(calls[0].url).toContain("/v2/track");

    const exception = allEnvelopes(calls).find(
      (e) => e.data?.baseType === "ExceptionData"
    );
    expect(exception).toBeDefined();
    expect(exception.iKey).toBe(IKEY);
    expect(exception.name).toContain("Exception");
    expect(exception.tags["ai.cloud.role"]).toBe("selector-extension-background");
    expect(exception.tags["ai.operation.id"]).toBe("sess-1");
    expect(exception.data.baseData.exceptions[0].message).toBe("boom");
  });

  it("sends an event envelope with name and measurements", async () => {
    const { calls } = stubFetch();
    await setTelemetryConnectionStringOverride(CONNECTION_STRING);

    const client = new BackgroundTelemetryClient();
    await client.init();
    client.trackEvent({
      name: "command.test",
      measurements: { durationMs: 5 },
    });
    await client.flush();

    await waitForCalls(calls, 1);

    const event = allEnvelopes(calls).find(
      (e) => e.data?.baseType === "EventData"
    );
    expect(event).toBeDefined();
    expect(event.iKey).toBe(IKEY);
    expect(event.data.baseData.name).toBe("command.test");
    expect(event.data.baseData.measurements.durationMs).toBe(5);
  });

  it("stamps the forwarded role for content/popup items", async () => {
    const { calls } = stubFetch();
    await setTelemetryConnectionStringOverride(CONNECTION_STRING);

    const client = new BackgroundTelemetryClient();
    await client.init();
    client.trackException(
      { error: new Error("from popup") },
      "selector-extension-popup"
    );

    await waitForCalls(calls, 1);
    const exception = allEnvelopes(calls).find(
      (e) => e.data?.baseType === "ExceptionData"
    );
    expect(exception.tags["ai.cloud.role"]).toBe("selector-extension-popup");
  });

  it("is a no-op when no connection string is configured", async () => {
    const { mock } = stubFetch();
    vi.spyOn(config, "getTelemetryConnectionString").mockResolvedValue(null);

    const client = new BackgroundTelemetryClient();
    await client.init();
    client.trackException({ error: new Error("nope") });
    client.trackEvent({ name: "command.test" });
    await client.flush();

    await new Promise((r) => setTimeout(r, 50));
    expect(mock).not.toHaveBeenCalled();
  });

  it("is a no-op when telemetry is disabled", async () => {
    const { mock } = stubFetch();
    await setTelemetryConnectionStringOverride(CONNECTION_STRING);
    await setTelemetryEnabled(false);

    const client = new BackgroundTelemetryClient();
    await client.init();
    client.trackException({ error: new Error("nope") });
    await client.flush();

    await new Promise((r) => setTimeout(r, 50));
    expect(mock).not.toHaveBeenCalled();
  });

  it("never throws when the SDK's track fails (safe wrapper)", async () => {
    stubFetch();
    await setTelemetryConnectionStringOverride(CONNECTION_STRING);
    const client = new BackgroundTelemetryClient();
    await client.init();

    // Force the underlying core to throw on track; safe() must swallow it so
    // application logic never sees a telemetry failure.
    const trackSpy = vi
      .spyOn(AppInsightsCore.prototype, "track")
      .mockImplementation(() => {
        throw new Error("sdk exploded");
      });

    expect(() => client.trackEvent({ name: "command.test" })).not.toThrow();
    expect(() =>
      client.trackException({ error: new Error("boom") })
    ).not.toThrow();

    trackSpy.mockRestore();
  });

  it("stops sending after the user opts out live (storage.onChanged)", async () => {
    const { mock } = stubFetch();
    await setTelemetryConnectionStringOverride(CONNECTION_STRING);
    const client = new BackgroundTelemetryClient();
    await client.init();

    // Opt out after init — the client's storage.onChanged listener flips enabled.
    await setTelemetryEnabled(false);

    client.trackEvent({ name: "command.test" });
    await client.flush();
    await new Promise((r) => setTimeout(r, 50));

    expect(mock).not.toHaveBeenCalled();
  });

  it("resumes sending after opt-out then opt-in", async () => {
    const { calls } = stubFetch();
    await setTelemetryConnectionStringOverride(CONNECTION_STRING);
    const client = new BackgroundTelemetryClient();
    await client.init();

    await setTelemetryEnabled(false);
    await setTelemetryEnabled(true);

    client.trackEvent({ name: "command.test" });
    await client.flush();
    await waitForCalls(calls, 1);

    expect(
      allEnvelopes(calls).some((e) => e.data?.baseData?.name === "command.test")
    ).toBe(true);
  });
});
