import { fakeBrowser } from "@webext-core/fake-browser";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getInstallId,
  getTelemetryConnectionString,
  getTelemetryEnabled,
  setTelemetryConnectionStringOverride,
  setTelemetryEnabled,
} from "../../lib/config";

const OVERRIDE = "InstrumentationKey=override;IngestionEndpoint=https://x/";

describe("telemetry config", () => {
  beforeEach(() => fakeBrowser.reset());

  describe("getInstallId", () => {
    it("generates once and returns the same id on subsequent calls", async () => {
      const first = await getInstallId();
      expect(first).toMatch(/^[0-9a-f-]{36}$/);

      const second = await getInstallId();
      expect(second).toBe(first);
    });
  });

  describe("getTelemetryEnabled", () => {
    it("defaults to enabled when unset", async () => {
      expect(await getTelemetryEnabled()).toBe(true);
    });

    it("is disabled only when explicitly set to false", async () => {
      await setTelemetryEnabled(false);
      expect(await getTelemetryEnabled()).toBe(false);

      await setTelemetryEnabled(true);
      expect(await getTelemetryEnabled()).toBe(true);
    });
  });

  describe("getTelemetryConnectionString", () => {
    it("falls back to the hard-coded string when no override is set", async () => {
      const cs = await getTelemetryConnectionString();
      expect(cs).toContain("InstrumentationKey=");
      expect(cs).not.toContain("override");
    });

    it("prefers a storage override over the hard-coded string", async () => {
      await setTelemetryConnectionStringOverride(OVERRIDE);
      expect(await getTelemetryConnectionString()).toBe(OVERRIDE);
    });

    it("clears the override on null and falls back to the hard-coded string", async () => {
      await setTelemetryConnectionStringOverride(OVERRIDE);
      await setTelemetryConnectionStringOverride(null);

      const cs = await getTelemetryConnectionString();
      expect(cs).not.toContain("override");
      expect(cs).toContain("InstrumentationKey=");
    });
  });
});
