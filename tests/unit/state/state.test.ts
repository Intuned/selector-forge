import { fakeBrowser } from "@webext-core/fake-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SelectorState } from "../../../lib/state/state";
import type { SelectorCreateState } from "../../../lib/state/schema";

/**
 * Behavior contract for SelectorState — the BG-side store the popup and
 * agent loop both read.
 *
 * Invariants worth fixing in tests:
 *   - meta (per-tab runtime info) is held in a sibling slot so it can never
 *     ride the wire to the backend via get().
 *   - subscribers fire exactly once per mutating call.
 *   - update() refuses to run without a current session.
 */

function makeState(overrides: Partial<SelectorCreateState> = {}): SelectorCreateState {
  return {
    schemaVersion: 2,
    sessionId: "sess-1",
    mode: "single",
    status: "running",
    page: {
      url: "https://example.com/",
      origin: "https://example.com",
      title: "Example",
      capturedAt: "2026-06-07T00:00:00.000Z",
    },
    targets: [{ elementId: "el-1" }],
    example: { inspectionView: "<body />", targetElementIds: ["el-1"] },
    seedCandidates: [],
    messages: [],
    browserRequest: null,
    browserResult: null,
    correctSelectors: [],
    ...overrides,
  };
}

describe("SelectorState", () => {
  let state: SelectorState;

  beforeEach(() => {
    state = new SelectorState();
  });

  describe("get / set / update", () => {
    it("returns null before any session is set", () => {
      expect(state.get()).toBeNull();
    });

    it("round-trips a session through set + get", () => {
      const next = makeState();
      state.set(next);
      expect(state.get()).toBe(next);
    });

    it("update applies a patch to the current session", () => {
      state.set(makeState({ status: "running" }));
      state.update((prev) => ({ ...prev, status: "done" }));
      expect(state.get()?.status).toBe("done");
    });

    it("update throws when there is no current session", () => {
      expect(() => state.update((s) => s)).toThrowError(/no active selector session/i);
    });
  });

  describe("meta", () => {
    it("round-trips meta independently of the session", () => {
      state.setMeta({ tabId: 42 });
      expect(state.getMeta()).toEqual({ tabId: 42 });
    });

    it("never leaks meta into get() — meta and the wire state are sibling slots", () => {
      state.set(makeState());
      state.setMeta({ tabId: 99 });
      const snapshot = state.get();
      expect(snapshot).not.toBeNull();
      expect(snapshot).not.toHaveProperty("tabId");
      expect(snapshot).not.toHaveProperty("meta");
    });

    it("setMeta does not notify subscribers (meta is local-only)", () => {
      const listener = vi.fn();
      state.subscribe(listener);
      state.setMeta({ tabId: 1 });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("clear", () => {
    it("drops both the session and the meta", () => {
      state.set(makeState());
      state.setMeta({ tabId: 7 });
      state.clear();
      expect(state.get()).toBeNull();
      expect(state.getMeta()).toBeNull();
    });

    it("notifies subscribers with null", () => {
      const listener = vi.fn();
      state.set(makeState());
      state.subscribe(listener);
      state.clear();
      expect(listener).toHaveBeenCalledExactlyOnceWith(null);
    });
  });

  describe("subscribe", () => {
    it("fires the listener exactly once per mutating call", () => {
      const listener = vi.fn();
      state.subscribe(listener);

      const first = makeState();
      state.set(first);
      state.update((prev) => ({ ...prev, status: "done" }));
      state.clear();

      expect(listener).toHaveBeenCalledTimes(3);
      // last call: clear() emits null
      expect(listener.mock.lastCall?.[0]).toBeNull();
    });

    it("delivers each mutation to every subscriber", () => {
      const a = vi.fn();
      const b = vi.fn();
      state.subscribe(a);
      state.subscribe(b);

      state.set(makeState());

      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    });

    it("returns an unsubscribe that stops further callbacks", () => {
      const listener = vi.fn();
      const unsubscribe = state.subscribe(listener);

      state.set(makeState());
      unsubscribe();
      state.clear();

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * Durability across a service-worker restart: a mutation mirrors the session
   * into `storage.session`, and a fresh `SelectorState` (a respawned SW) can
   * `hydrate()` it back. Modeled by mutating one instance, then constructing a
   * second that reads the same fake storage.
   */
  describe("persistence across SW restarts", () => {
    beforeEach(() => {
      fakeBrowser.reset();
    });

    async function respawn(): Promise<SelectorState> {
      const next = new SelectorState();
      await next.hydrate();
      return next;
    }

    it("restores the session a previous instance persisted", async () => {
      state.set(makeState({ status: "running" }));
      state.setMeta({ tabId: 42 });

      const revived = await respawn();
      expect(revived.get()).toEqual(makeState({ status: "running" }));
      expect(revived.getMeta()).toEqual({ tabId: 42 });
    });

    it("comes up empty when nothing was persisted", async () => {
      const revived = await respawn();
      expect(revived.get()).toBeNull();
      expect(revived.getMeta()).toBeNull();
    });

    it("does not resurrect a cleared session", async () => {
      state.set(makeState());
      state.setMeta({ tabId: 7 });
      state.clear();

      const revived = await respawn();
      expect(revived.get()).toBeNull();
      expect(revived.getMeta()).toBeNull();
    });

    it("ignores schema-invalid persisted data", async () => {
      await fakeBrowser.storage.session.set({
        "session.selectorState": { current: { not: "a session" }, meta: { tabId: 1 } },
      });

      const revived = await respawn();
      expect(revived.get()).toBeNull();
      expect(revived.getMeta()).toBeNull();
    });

    it("resolves `ready` after hydrate, even with no stored data", async () => {
      const revived = new SelectorState();
      await revived.hydrate();
      await expect(revived.ready).resolves.toBeUndefined();
    });

    it("hydrate is idempotent — a second call is a no-op", async () => {
      state.set(makeState({ status: "running" }));
      const revived = await respawn();

      // A late persist from elsewhere must not be picked up by re-hydrating.
      await fakeBrowser.storage.session.set({ "session.selectorState": null });
      await revived.hydrate();
      expect(revived.get()).toEqual(makeState({ status: "running" }));
    });
  });
});
