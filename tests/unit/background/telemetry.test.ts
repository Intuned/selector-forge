import { describe, expect, it } from "vitest";
import {
  handleTrackTelemetryEvent,
  handleTrackTelemetryException,
} from "../../../lib/background/handlers/telemetry";
import { createHarness } from "./harness";

describe("telemetry forwarding handlers", () => {
  it("forwards an event to the client carrying the originating role", () => {
    const h = createHarness();

    handleTrackTelemetryEvent(
      {
        role: "selector-extension-content",
        name: "command.test",
        measurements: { durationMs: 3 },
      },
      h.context
    );

    expect(h.telemetry.events).toHaveLength(1);
    expect(h.telemetry.events[0].role).toBe("selector-extension-content");
    expect(h.telemetry.events[0].input.name).toBe("command.test");
    expect(h.telemetry.events[0].input.measurements?.durationMs).toBe(3);
  });

  it("rebuilds an Error from the flattened shape before forwarding", () => {
    const h = createHarness();

    handleTrackTelemetryException(
      {
        role: "selector-extension-popup",
        name: "TypeError",
        message: "boom",
        stack: "TypeError: boom\n at x",
      },
      h.context
    );

    expect(h.telemetry.exceptions).toHaveLength(1);
    const { input, role } = h.telemetry.exceptions[0];
    expect(role).toBe("selector-extension-popup");
    expect(input.error).toBeInstanceOf(Error);
    expect((input.error as Error).name).toBe("TypeError");
    expect((input.error as Error).message).toBe("boom");
  });
});
