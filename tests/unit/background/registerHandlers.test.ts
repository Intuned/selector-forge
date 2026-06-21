import { fakeBrowser } from "@webext-core/fake-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  registerBackgroundHandlers,
  type BackgroundHandlers,
} from "../../../lib/background/registerHandlers";
import {
  BackgroundMessageType,
  backgroundProtocol,
} from "../../../lib/messaging";
import { createHarness } from "./harness";

/**
 * The command-instrumentation choke point in `registerBackgroundHandlers`: every
 * command handler is wrapped to emit a `command.*` event on success or an
 * exception (re-thrown) on failure, while telemetry-forwarding messages are
 * deliberately excluded to avoid telemetry-about-telemetry. We register through
 * a stubbed `backgroundProtocol.onMessage` to capture each wrapped callback, then
 * invoke it directly.
 */

type Registered = Map<
  BackgroundMessageType,
  (message: { data: unknown; sender: unknown }) => unknown
>;

function captureRegistrations(): Registered {
  const registered: Registered = new Map();
  vi.spyOn(backgroundProtocol, "onMessage").mockImplementation(((
    type: BackgroundMessageType,
    cb: (m: { data: unknown; sender: unknown }) => unknown
  ) => {
    registered.set(type, cb);
    return () => {};
  }) as never);
  return registered;
}

function makeHandlers(
  overrides: Partial<Record<BackgroundMessageType, () => unknown>>
): BackgroundHandlers {
  const handlers = {} as Record<BackgroundMessageType, () => unknown>;
  for (const key of Object.values(BackgroundMessageType)) {
    handlers[key] = overrides[key] ?? (async () => undefined);
  }
  return handlers as BackgroundHandlers;
}

describe("registerBackgroundHandlers (command instrumentation)", () => {
  beforeEach(() => fakeBrowser.reset());
  afterEach(() => vi.restoreAllMocks());

  it("emits a command.* event with duration on success and returns the result", async () => {
    const h = createHarness();
    await h.state.hydrate(); // the wrapper awaits ctx.state.ready
    const registered = captureRegistrations();
    registerBackgroundHandlers(
      makeHandlers({
        [BackgroundMessageType.GetSessionState]: async () => "result",
      }),
      h.context
    );

    const cb = registered.get(BackgroundMessageType.GetSessionState)!;
    const result = await cb({ data: undefined, sender: undefined });

    expect(result).toBe("result");
    const event = h.telemetry.events.find(
      (e) => e.input.name === `command.${BackgroundMessageType.GetSessionState}`
    );
    expect(event).toBeDefined();
    expect(typeof event?.input.measurements?.durationMs).toBe("number");
    expect(h.telemetry.exceptions).toHaveLength(0);
  });

  it("records an exception (command property) and re-throws on handler failure", async () => {
    const h = createHarness();
    await h.state.hydrate(); // the wrapper awaits ctx.state.ready
    const registered = captureRegistrations();
    const boom = new Error("handler boom");
    registerBackgroundHandlers(
      makeHandlers({
        [BackgroundMessageType.SignOut]: async () => {
          throw boom;
        },
      }),
      h.context
    );

    const cb = registered.get(BackgroundMessageType.SignOut)!;
    await expect(cb({ data: undefined, sender: undefined })).rejects.toThrow(
      "handler boom"
    );

    const ex = h.telemetry.exceptions.find(
      (e) => e.input.properties?.command === BackgroundMessageType.SignOut
    );
    expect(ex).toBeDefined();
    expect(ex?.input.error).toBe(boom);
    // A failed command must NOT also emit a success event.
    expect(
      h.telemetry.events.some(
        (e) => e.input.name === `command.${BackgroundMessageType.SignOut}`
      )
    ).toBe(false);
  });

  it("does not instrument telemetry-forwarding messages (no telemetry about telemetry)", async () => {
    const h = createHarness();
    await h.state.hydrate(); // the wrapper awaits ctx.state.ready
    const registered = captureRegistrations();
    let handlerCalled = false;
    registerBackgroundHandlers(
      makeHandlers({
        [BackgroundMessageType.TrackTelemetryEvent]: async () => {
          handlerCalled = true;
        },
      }),
      h.context
    );

    const cb = registered.get(BackgroundMessageType.TrackTelemetryEvent)!;
    await cb({
      data: { role: "selector-extension-content", name: "x" },
      sender: undefined,
    });

    expect(handlerCalled).toBe(true);
    // No `command.*` event for the forwarding message itself.
    expect(
      h.telemetry.events.some((e) => e.input.name.startsWith("command."))
    ).toBe(false);
  });
});
