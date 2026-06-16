import { fakeBrowser } from "@webext-core/fake-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installIntunedBridge } from "../../../lib/background/bridge";
import type { BackgroundHandlers } from "../../../lib/background";
import { BackgroundMessageType } from "../../../lib/messaging";
import { createHarness } from "./harness";

const initAuthMock = vi.fn();
const configureTokenMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  initAuth: (...args: unknown[]) => initAuthMock(...args),
  configureToken: (...args: unknown[]) => configureTokenMock(...args),
}));

type BridgeGlobal = {
  __intunedBridge: {
    handle: (
      type: string,
      payload: unknown,
      accessToken?: string
    ) => Promise<
      | { ok: true; result: unknown }
      | { ok: false; error: { name: string; message: string } }
    >;
  };
};

function getBridge() {
  return (globalThis as unknown as BridgeGlobal).__intunedBridge;
}

/**
 * The bridge routes external (CDP) calls into the handler table. It must
 * never reject — handler failures come back as `{ ok: false }` envelopes.
 */
describe("__intunedBridge", () => {
  const handlerMock = vi.fn();
  // The bridge only indexes the table; a partial table cast to the
  // exhaustive type is enough for routing tests.
  const handlers = {
    [BackgroundMessageType.GetSessionState]: handlerMock,
  } as unknown as BackgroundHandlers;

  beforeEach(async () => {
    fakeBrowser.reset();
    initAuthMock.mockReset().mockResolvedValue({ authenticated: false });
    configureTokenMock.mockReset().mockResolvedValue({ authenticated: true });
    handlerMock.mockReset().mockResolvedValue({ value: 42 });

    const h = createHarness();
    await h.state.hydrate(); // resolve state.ready, as background startup does
    installIntunedBridge(handlers, h.context);
  });

  afterEach(() => {
    delete (globalThis as Partial<BridgeGlobal>).__intunedBridge;
  });

  it("routes a known type into the handler table and wraps the result", async () => {
    const result = await getBridge().handle(
      BackgroundMessageType.GetSessionState,
      { some: "payload" }
    );

    expect(result).toEqual({ ok: true, result: { value: 42 } });
    expect(handlerMock).toHaveBeenCalledWith(
      { some: "payload" },
      expect.objectContaining({ sender: undefined })
    );
  });

  it("maps a void handler result to null (JSON-serializable envelope)", async () => {
    handlerMock.mockResolvedValue(undefined);
    const result = await getBridge().handle(BackgroundMessageType.GetSessionState, null);
    expect(result).toEqual({ ok: true, result: null });
  });

  it("rejects unknown message types without touching handlers or auth", async () => {
    const result = await getBridge().handle("bg:nope", {});

    expect(result).toMatchObject({
      ok: false,
      error: { name: "UnknownMessageType" },
    });
    expect(handlerMock).not.toHaveBeenCalled();
    expect(initAuthMock).not.toHaveBeenCalled();
  });

  it("returns a handler throw as an ok:false envelope (never rejects)", async () => {
    handlerMock.mockRejectedValue(new Error("boom"));

    const result = await getBridge().handle(BackgroundMessageType.GetSessionState, null);

    expect(result).toEqual({
      ok: false,
      error: { name: "Error", message: "boom" },
    });
  });

  it("skips auth negotiation entirely when no accessToken is passed", async () => {
    await getBridge().handle(BackgroundMessageType.GetSessionState, null);

    expect(initAuthMock).not.toHaveBeenCalled();
    expect(configureTokenMock).not.toHaveBeenCalled();
  });

  it("keeps existing working auth (does not apply the caller's token)", async () => {
    initAuthMock.mockResolvedValue({ authenticated: true });

    await getBridge().handle(BackgroundMessageType.GetSessionState, null, "jwt-123");

    expect(initAuthMock).toHaveBeenCalledTimes(1);
    expect(configureTokenMock).not.toHaveBeenCalled();
  });

  it("applies the caller's token when the extension has no working auth", async () => {
    initAuthMock.mockResolvedValue({ authenticated: false });

    await getBridge().handle(BackgroundMessageType.GetSessionState, null, "jwt-123");

    expect(configureTokenMock).toHaveBeenCalledWith("jwt-123");
  });

  it("falls back to the caller's token when current auth cannot be resolved", async () => {
    initAuthMock.mockRejectedValue(new Error("Network error calling /api/auth/me"));

    const result = await getBridge().handle(
      BackgroundMessageType.GetSessionState,
      null,
      "jwt-123"
    );

    expect(result).toEqual({ ok: true, result: { value: 42 } });
    expect(configureTokenMock).toHaveBeenCalledWith("jwt-123");
  });

  it("surfaces a failed token application as an ok:false envelope", async () => {
    initAuthMock.mockResolvedValue({ authenticated: false });
    configureTokenMock.mockRejectedValue(new Error("INTUNED token has expired."));

    const result = await getBridge().handle(
      BackgroundMessageType.GetSessionState,
      null,
      "expired-jwt"
    );

    expect(result).toMatchObject({
      ok: false,
      error: { message: "INTUNED token has expired." },
    });
    expect(handlerMock).not.toHaveBeenCalled();
  });
});
