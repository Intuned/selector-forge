import { beforeEach, describe, expect, it, vi } from "vitest";
import { backgroundProtocol, BackgroundMessageType } from "../../../lib/messaging";
import { createForwardingSink } from "../../../lib/telemetry/forwardingSink";

describe("createForwardingSink", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards an event to the background with the originating role", () => {
    const send = vi
      .spyOn(backgroundProtocol, "sendMessage")
      .mockResolvedValue(undefined as never);

    const sink = createForwardingSink("selector-extension-content");
    sink.trackEvent({ name: "command.test", properties: { mode: "single" } });

    expect(send).toHaveBeenCalledWith(
      BackgroundMessageType.TrackTelemetryEvent,
      expect.objectContaining({
        role: "selector-extension-content",
        name: "command.test",
        properties: { mode: "single" },
      })
    );
  });

  it("normalizes the Error to a transport-safe shape before forwarding", () => {
    const send = vi
      .spyOn(backgroundProtocol, "sendMessage")
      .mockResolvedValue(undefined as never);

    const sink = createForwardingSink("selector-extension-popup");
    sink.trackException({ error: new TypeError("boom") });

    const [type, data] = send.mock.calls[0];
    expect(type).toBe(BackgroundMessageType.TrackTelemetryException);
    expect(data).toMatchObject({
      role: "selector-extension-popup",
      name: "TypeError",
      message: "boom",
    });
  });

  it("swallows background send failures", () => {
    vi.spyOn(backgroundProtocol, "sendMessage").mockRejectedValue(
      new Error("bg down") as never
    );
    const sink = createForwardingSink("selector-extension-content");
    expect(() => sink.trackEvent({ name: "x" })).not.toThrow();
  });
});
