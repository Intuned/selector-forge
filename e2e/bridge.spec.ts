import { test, expect } from "./fixtures";
import { getServiceWorker, openSamplePage } from "./helpers";

// The production CDP bridge (`__intunedBridge`, lib/background/bridge.ts) as
// the CLI drives it: `Runtime.evaluate` in the worker context. `sw.evaluate`
// is the same mechanism, so this exercises the exact contract.

type BridgeEnvelope =
  | { ok: true; result: unknown }
  | { ok: false; error: { name: string; message: string } };

declare const __intunedBridge: {
  handle: (
    type: string,
    payload: unknown,
    accessToken?: string
  ) => Promise<BridgeEnvelope>;
};

test("bridge starts a session for an explicit tab and exposes it via GetSessionState", async ({
  context,
}) => {
  const { tabId, url } = await openSamplePage(context);
  const sw = await getServiceWorker(context);

  const startEnvelope = (await sw.evaluate(
    async (args) =>
      __intunedBridge.handle("bg:startPickerSessionForTab", {
        mode: "single",
        tabId: args.tabId,
      }),
    { tabId }
  )) as BridgeEnvelope;

  expect(startEnvelope.ok).toBe(true);
  const started = (startEnvelope as { ok: true; result: unknown }).result as {
    sessionId: string;
    tabId: number;
    page: { url: string };
  };
  expect(started.tabId).toBe(tabId);
  expect(started.page.url).toBe(url);
  expect(started.sessionId.length).toBeGreaterThan(0);

  const stateEnvelope = (await sw.evaluate(async () =>
    __intunedBridge.handle("bg:getSessionState", null)
  )) as BridgeEnvelope;

  expect(stateEnvelope.ok).toBe(true);
  expect((stateEnvelope as { ok: true; result: unknown }).result).toMatchObject({
    sessionId: started.sessionId,
    status: "picking",
    mode: "single",
  });
});

test("bridge returns ok:false envelopes for unknown types and handler errors", async ({
  context,
}) => {
  const sw = await getServiceWorker(context);

  const unknown = (await sw.evaluate(async () =>
    __intunedBridge.handle("bg:doesNotExist", {})
  )) as BridgeEnvelope;
  expect(unknown).toMatchObject({
    ok: false,
    error: { name: "UnknownMessageType" },
  });

  // No tab matches this filter — the handler throws, the bridge wraps it.
  const noMatch = (await sw.evaluate(async () =>
    __intunedBridge.handle("bg:startPickerSessionForTab", {
      mode: "single",
      urlContains: "no-such-tab-url-substring",
    })
  )) as BridgeEnvelope;
  expect(noMatch.ok).toBe(false);
  expect(
    (noMatch as { ok: false; error: { message: string } }).error.message
  ).toMatch(/no open tab matches/i);
});
