import { fakeBrowser } from "@webext-core/fake-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleBootstrapPopup } from "../../../lib/background/handlers/bootstrapPopup";
import { handleCancelPickerSession } from "../../../lib/background/handlers/cancelSelectorPickerSession";
import { handleStartAgent } from "../../../lib/background/handlers/startAgent";
import { handleStartPickerSession } from "../../../lib/background/handlers/startSelectorPickerSession";
import {
  BackgroundMessageType,
  ContentMessageType,
} from "../../../lib/messaging";
import { loadLastMode, saveLastMode } from "../../../lib/state";
import {
  createHarness,
  makeInflightSession,
  PAGE,
  senderFromTab,
} from "./harness";

/**
 * Background handler tests. Drive the handler directly with a real state
 * object and a fake messaging client; assert on the side effects the
 * background protocol commits to (state mutations + outbound messages).
 */

describe("handleStartPickerSession", () => {
  beforeEach(() => fakeBrowser.reset());
  afterEach(() => vi.restoreAllMocks());

  it("resolves the tabId from the message sender (popup case), sets meta + initial state, dispatches ActivatePicker, returns the new sessionId", async () => {
    const h = createHarness({ sender: senderFromTab(42) });

    const { sessionId } = await handleStartPickerSession(
      { mode: "single", page: PAGE },
      h.context
    );

    expect(typeof sessionId).toBe("string");
    expect(sessionId.length).toBeGreaterThan(0);

    expect(h.state.getMeta()).toEqual({ tabId: 42 });
    expect(h.state.get()).toMatchObject({
      schemaVersion: 2,
      sessionId,
      mode: "single",
      status: "picking",
      page: PAGE,
      targets: [],
      browserRequest: null,
      browserResult: null,
    });

    expect(h.messaging.contentCalls).toEqual([
      {
        tabId: 42,
        type: ContentMessageType.ActivatePicker,
        data: { sessionId, mode: "single", status: "picking", targets: [] },
      },
    ]);
  });

  it("falls back to the active tab when the popup is the sender (no sender.tab)", async () => {
    // Don't depend on fakeBrowser's currentWindow/active filtering — pin
    // tabs.query directly so the test reflects what the handler does, not
    // what the fake's filter implements.
    vi.spyOn(fakeBrowser.tabs, "query").mockResolvedValue([
      { id: 17 } as Awaited<ReturnType<typeof fakeBrowser.tabs.query>>[number],
    ]);

    const h = createHarness({ sender: undefined });

    const { sessionId } = await handleStartPickerSession(
      { mode: "list", page: PAGE },
      h.context
    );

    expect(fakeBrowser.tabs.query).toHaveBeenCalledWith({
      active: true,
      currentWindow: true,
    });
    expect(h.state.getMeta()).toEqual({ tabId: 17 });
    expect(h.messaging.contentCalls[0]).toMatchObject({
      tabId: 17,
      type: ContentMessageType.ActivatePicker,
      data: { sessionId, mode: "list" },
    });
  });

  it("throws when there is no active tab to attach to (no sender, no tabs.query result)", async () => {
    // fakeBrowser starts with no tabs; query returns [].
    const h = createHarness({ sender: undefined });

    await expect(
      handleStartPickerSession({ mode: "single", page: PAGE }, h.context)
    ).rejects.toThrow(/no active tab/i);

    // Pre-condition: nothing was mutated / dispatched.
    expect(h.state.get()).toBeNull();
    expect(h.state.getMeta()).toBeNull();
    expect(h.messaging.contentCalls).toEqual([]);
  });

  it("cancels any in-flight agent loop before starting the new session", async () => {
    const h = createHarness({ sender: senderFromTab(1) });
    await handleStartPickerSession({ mode: "single", page: PAGE }, h.context);
    expect(h.agentLoop.cancelCalls).toBe(1);
  });

  it("replaces a previous session in state (each start produces a distinct sessionId)", async () => {
    const h = createHarness({ sender: senderFromTab(1) });

    const first = await handleStartPickerSession(
      { mode: "single", page: PAGE },
      h.context
    );
    const firstStored = h.state.get()?.sessionId;

    const second = await handleStartPickerSession(
      { mode: "list", page: PAGE },
      h.context
    );

    expect(second.sessionId).not.toBe(first.sessionId);
    expect(h.state.get()?.sessionId).toBe(second.sessionId);
    expect(h.state.get()?.sessionId).not.toBe(firstStored);
  });
});

describe("handleCancelPickerSession", () => {
  beforeEach(() => fakeBrowser.reset());
  afterEach(() => vi.restoreAllMocks());

  it("cancels the loop, clears state, and dispatches DeactivatePicker to the message sender's tab", async () => {
    const h = createHarness({ sender: senderFromTab(7) });
    h.state.setMeta({ tabId: 7 });
    h.state.set(makeInflightSession({ sessionId: "sess-X" }));

    await handleCancelPickerSession({ sessionId: "sess-X" }, h.context);

    expect(h.agentLoop.cancelCalls).toBe(1);
    expect(h.state.get()).toBeNull();
    expect(h.state.getMeta()).toBeNull();
    expect(h.messaging.contentCalls).toEqual([
      {
        tabId: 7,
        type: ContentMessageType.DeactivatePicker,
        data: { sessionId: "sess-X" },
      },
    ]);
  });

  it("falls back to the stored meta tabId when there's no sender (popup-initiated cancel)", async () => {
    const h = createHarness({ sender: undefined });
    h.state.setMeta({ tabId: 9 });
    h.state.set(makeInflightSession());

    await handleCancelPickerSession({ sessionId: "sess-1" }, h.context);

    expect(h.messaging.contentCalls[0]?.tabId).toBe(9);
  });

  it("still clears state when no tab is known (no DeactivatePicker dispatched)", async () => {
    const h = createHarness({ sender: undefined });
    h.state.set(makeInflightSession());

    await expect(
      handleCancelPickerSession({ sessionId: "sess-1" }, h.context)
    ).resolves.toBeUndefined();

    expect(h.state.get()).toBeNull();
    expect(h.messaging.contentCalls).toEqual([]);
  });

  it("clears the popup's saved mode on a UI-initiated cancel", async () => {
    const h = createHarness({ sender: senderFromTab(7) });
    h.state.set(makeInflightSession({ sessionId: "sess-1" }));
    await saveLastMode("list");

    await handleCancelPickerSession({ sessionId: "sess-1" }, h.context);

    expect(await loadLastMode()).toBeNull();
  });

  it("preserves the popup's saved mode on a programmatic (bridge) cancel", async () => {
    const h = createHarness({ sender: undefined });
    h.state.set(makeInflightSession({ sessionId: "sess-1" }));
    await saveLastMode("list");

    await handleCancelPickerSession(
      { sessionId: "sess-1" },
      { ...h.context, viaBridge: true }
    );

    // The CLI never sets lastMode, so its cancel must not wipe the popup's pref.
    expect(await loadLastMode()).toBe("list");
    // Session is still torn down.
    expect(h.state.get()).toBeNull();
  });

  it("ignores a stale cancel for a session that was already replaced", async () => {
    const h = createHarness({ sender: undefined });
    h.state.setMeta({ tabId: 9 });
    h.state.set(makeInflightSession({ sessionId: "sess-new" }));

    // A stale teardown (e.g. CLI timeout) for the old session must not clobber
    // the session that replaced it.
    await handleCancelPickerSession({ sessionId: "sess-old" }, h.context);

    expect(h.agentLoop.cancelCalls).toBe(0);
    expect(h.state.get()?.sessionId).toBe("sess-new");
    expect(h.state.getMeta()).toEqual({ tabId: 9 });
    expect(h.messaging.contentCalls).toEqual([]);
  });

  it("tolerates a vanished content script — DeactivatePicker rejection is swallowed", async () => {
    const h = createHarness({ sender: senderFromTab(7) });
    h.state.setMeta({ tabId: 7 });
    h.state.set(makeInflightSession());
    h.messaging.rejectContent(
      ContentMessageType.DeactivatePicker,
      new Error("Receiving end does not exist")
    );

    await expect(
      handleCancelPickerSession({ sessionId: "sess-1" }, h.context)
    ).resolves.toBeUndefined();

    // State is still cleared even though the content message threw.
    expect(h.state.get()).toBeNull();
  });
});

describe("handleStartAgent", () => {
  beforeEach(() => fakeBrowser.reset());
  afterEach(() => vi.restoreAllMocks());

  it("folds targets + builds the example, flips status to running, then kicks off the agent loop", async () => {
    const h = createHarness({ sender: senderFromTab(1) });
    h.state.set(makeInflightSession({ sessionId: "sess-K", status: "picking" }));

    await handleStartAgent(
      {
        sessionId: "sess-K",
        targets: [{ elementId: "el-1" }, { elementId: "el-2" }],
        inspectionView: "<body>view</body>",
      },
      h.context
    );

    expect(h.state.get()).toMatchObject({
      status: "running",
      targets: [{ elementId: "el-1" }, { elementId: "el-2" }],
      example: {
        inspectionView: "<body>view</body>",
        targetElementIds: ["el-1", "el-2"],
      },
    });
    expect(h.agentLoop.runCalls).toEqual(["sess-K"]);
  });

  it("does NOT fold into a different session (mismatched sessionId is a silent no-op)", async () => {
    const h = createHarness({ sender: senderFromTab(1) });
    h.state.set(makeInflightSession({ sessionId: "sess-current" }));
    const before = JSON.stringify(h.state.get());

    await handleStartAgent(
      {
        sessionId: "sess-stale",
        targets: [{ elementId: "intruder" }],
        inspectionView: "<body>intruder</body>",
      },
      h.context
    );

    expect(JSON.stringify(h.state.get())).toBe(before);
    expect(h.agentLoop.runCalls).toEqual([]);
  });

  it("is a silent no-op when there is no current session at all", async () => {
    const h = createHarness({ sender: senderFromTab(1) });
    // state is empty

    await handleStartAgent(
      {
        sessionId: "anything",
        targets: [{ elementId: "x" }],
        inspectionView: "",
      },
      h.context
    );

    expect(h.state.get()).toBeNull();
    expect(h.agentLoop.runCalls).toEqual([]);
  });
});

describe("handleBootstrapPopup", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    // initAuth() walks the auth providers; give them a deterministic answer
    // by pretending the session endpoint reports "not signed in".
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ({
          status: 401,
          ok: false,
          json: async () => null,
        }) as Response
      )
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("bundles the current session snapshot with the auth state (popup first-paint contract)", async () => {
    const h = createHarness();
    h.state.set(makeInflightSession({ sessionId: "sess-J" }));

    const snapshot = await handleBootstrapPopup(undefined as never, h.context);

    expect(snapshot.session).toMatchObject({ sessionId: "sess-J" });
    expect(snapshot.auth).toMatchObject({
      authenticated: false,
      hasToken: false,
    });
  });

  it("returns session=null when no session is in-flight", async () => {
    const h = createHarness();
    const snapshot = await handleBootstrapPopup(undefined as never, h.context);
    expect(snapshot.session).toBeNull();
  });
});

describe("background handler registry", () => {
  it("covers every BackgroundMessageType (exhaustiveness contract)", async () => {
    const { backgroundHandlers } = await import(
      "../../../lib/background/handlers"
    );
    const messageTypes = Object.values(BackgroundMessageType);
    const handlerKeys = Object.keys(backgroundHandlers);
    expect(new Set(handlerKeys)).toEqual(new Set(messageTypes));
  });
});
