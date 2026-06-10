import { fakeBrowser } from "@webext-core/fake-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentLoopController } from "../../../lib/agent";
import { ContentMessageType, PopupMessageType } from "../../../lib/messaging";
import { SelectorState } from "../../../lib/state";
import type {
  BrowserRequestRecord,
  SelectorCreateResponse,
  SelectorCreateState,
  SelectorResultRecord,
} from "../../../lib/state";
import {
  createFakeMessagingClient,
  type FakeMessagingClient,
  makeInflightSession,
  silenceConsole,
} from "../background/harness";

// ── fetch script ─────────────────────────────────────────────────────────────

type FetchScript = SelectorCreateResponse[];

function scriptFetch(script: FetchScript): ReturnType<typeof vi.fn> {
  let i = 0;
  const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
    if (init?.signal?.aborted) {
      throw new DOMException("aborted", "AbortError");
    }
    if (i >= script.length) {
      throw new Error(`fetch script exhausted at call ${i + 1}`);
    }
    const response = script[i++];
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => response,
      text: async () => "",
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function scriptFetchError(response: {
  status: number;
  statusText?: string;
  text?: string;
}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        ({
          ok: false,
          status: response.status,
          statusText: response.statusText ?? "Error",
          text: async () => response.text ?? "",
        } as Response)
    )
  );
}

function scriptFetchThrow(error: Error): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw error;
    })
  );
}

// ── response builders ────────────────────────────────────────────────────────

function doneOk(state: SelectorCreateState): SelectorCreateResponse {
  return {
    state: {
      ...state,
      status: "done",
      finalResult: {
        status: "ok",
        bestSelector: { type: "css", value: "#picked" },
      },
    },
    action: { type: "done" },
  };
}

function backendError(
  state: SelectorCreateState,
  message: string
): SelectorCreateResponse {
  return {
    state: {
      ...state,
      status: "error",
      errors: [
        {
          code: "ERR",
          message,
          source: "backend",
          recoverable: false,
        },
      ],
    },
    action: { type: "error" },
  };
}

function testSelectorsTurn(
  state: SelectorCreateState,
  requestId: string,
  selectors: Array<{ type: "css" | "xpath"; value: string }>
): SelectorCreateResponse {
  const browserRequest: BrowserRequestRecord = {
    id: requestId,
    type: "test_selectors",
    createdAt: "2026-06-07T00:00:00.000Z",
    selectors,
    toolCallId: `tc-${requestId}`,
  };
  return {
    state: { ...state, browserRequest, status: "awaiting_browser" },
    action: { type: "test_selectors", requestId },
  };
}

// ── setup ────────────────────────────────────────────────────────────────────

interface LoopFixture {
  state: SelectorState;
  messaging: FakeMessagingClient;
  controller: AgentLoopController;
  sessionId: string;
  tabId: number;
}

function setupLoop(opts: { withTab?: boolean } = {}): LoopFixture {
  const state = new SelectorState();
  const session = makeInflightSession();
  state.set(session);
  if (opts.withTab !== false) state.setMeta({ tabId: 42 });

  const messaging = createFakeMessagingClient();
  const controller = new AgentLoopController({
    state,
    backgroundMessagingClient: messaging,
  });
  return {
    state,
    messaging,
    controller,
    sessionId: session.sessionId,
    tabId: 42,
  };
}

describe("AgentLoopController", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    silenceConsole();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("happy path", () => {
    it("done in one turn → settle dispatches DeactivatePicker + SelectorGenerationSettled, status returns to idle", async () => {
      const { state, messaging, controller, sessionId, tabId } = setupLoop();
      scriptFetch([doneOk(state.get()!)]);

      await controller.runAgentLoop(sessionId);

      // State reflects the final response.
      expect(state.get()?.status).toBe("done");
      expect(state.get()?.finalResult).toEqual({
        status: "ok",
        bestSelector: { type: "css", value: "#picked" },
      });

      // Settle side-effects.
      expect(messaging.contentCalls).toEqual([
        expect.objectContaining({
          tabId,
          type: ContentMessageType.DeactivatePicker,
          data: { sessionId },
        }),
      ]);
      expect(messaging.popupCalls).toEqual([
        {
          type: PopupMessageType.SelectorGenerationSettled,
          data: {
            sessionId,
            result: {
              status: "ok",
              bestSelector: { type: "css", value: "#picked" },
            },
          },
        },
      ]);

      // Status released for the next session.
      expect(controller.getStatus()).toBe("idle");
    });
  });

  describe("test_selectors round", () => {
    it("forwards selectors to the content script, folds the browser result into state, then continues to done", async () => {
      const { state, messaging, controller, sessionId, tabId } = setupLoop();
      const selectors = [{ type: "css" as const, value: ".row" }];

      const firstResponse = testSelectorsTurn(state.get()!, "req-1", selectors);
      const secondResponse = doneOk(firstResponse.state);
      scriptFetch([firstResponse, secondResponse]);

      const selectorResults: SelectorResultRecord[] = [
        {
          selector: selectors[0],
          foundElementIds: ["el-1"],
        },
      ];
      messaging.whenContent(ContentMessageType.TestSelectors, () => ({
        selectorResults,
      }));

      await controller.runAgentLoop(sessionId);

      // The content call carried the right session + request + selectors.
      const testCall = messaging.contentCalls.find(
        (c) => c.type === ContentMessageType.TestSelectors
      );
      expect(testCall).toMatchObject({
        tabId,
        type: ContentMessageType.TestSelectors,
        data: {
          sessionId,
          requestId: "req-1",
          selectors,
        },
      });

      // After folding, the browser result is on state for the next turn.
      // (It survives because the second response's state was based on the
      // first response's state pre-fold; the agent sees both turns.)
      // Final state is the second response's terminal state.
      expect(state.get()?.status).toBe("done");

      // Both fetch turns ran, then settle ran.
      expect(messaging.contentCalls.map((c) => c.type)).toEqual([
        ContentMessageType.TestSelectors,
        ContentMessageType.DeactivatePicker,
      ]);
      expect(messaging.popupCalls[0]?.type).toBe(
        PopupMessageType.SelectorGenerationSettled
      );
    });

    it("supports multi-round refinement (two test_selectors rounds, then done)", async () => {
      const { state, messaging, controller, sessionId } = setupLoop();

      const round1 = testSelectorsTurn(state.get()!, "req-1", [
        { type: "css", value: ".row" },
      ]);
      const round2 = testSelectorsTurn(round1.state, "req-2", [
        { type: "css", value: "li.row" },
      ]);
      const final = doneOk(round2.state);
      scriptFetch([round1, round2, final]);

      messaging.whenContent(ContentMessageType.TestSelectors, () => ({
        selectorResults: [
          {
            selector: { type: "css", value: "x" },
            foundElementIds: [],
          },
        ],
      }));

      await controller.runAgentLoop(sessionId);

      const testCalls = messaging.contentCalls.filter(
        (c) => c.type === ContentMessageType.TestSelectors
      );
      expect(testCalls).toHaveLength(2);
      expect(
        testCalls.map((c) => (c.data as { requestId: string }).requestId)
      ).toEqual(["req-1", "req-2"]);
      expect(state.get()?.status).toBe("done");
    });
  });

  describe("error surfaces", () => {
    it("backend `error` action settles the session with the first error's message", async () => {
      const { state, messaging, controller, sessionId } = setupLoop();
      scriptFetch([backendError(state.get()!, "model refused")]);

      await controller.runAgentLoop(sessionId);

      expect(state.get()?.status).toBe("error");
      expect(messaging.popupCalls[0]).toMatchObject({
        type: PopupMessageType.SelectorGenerationSettled,
        data: {
          sessionId,
          result: { status: "error", note: "model refused" },
        },
      });
    });

    it("non-OK HTTP from the backend settles the session with an error (not a hang)", async () => {
      const { messaging, controller, sessionId } = setupLoop();
      scriptFetchError({ status: 500, statusText: "Internal Error" });

      await controller.runAgentLoop(sessionId);

      expect(messaging.popupCalls[0]?.type).toBe(
        PopupMessageType.SelectorGenerationSettled
      );
      const result = (
        messaging.popupCalls[0]?.data as {
          result: { status: string; note?: string };
        }
      ).result;
      expect(result.status).toBe("error");
      expect(result.note).toMatch(/500/);
      expect(controller.getStatus()).toBe("idle");
    });

    it("network failure (fetch throws) settles the session with the error message", async () => {
      const { messaging, controller, sessionId } = setupLoop();
      scriptFetchThrow(new Error("connection refused"));

      await controller.runAgentLoop(sessionId);

      const settled = messaging.popupCalls[0];
      expect(settled?.type).toBe(PopupMessageType.SelectorGenerationSettled);
      expect((settled?.data as { result: { note?: string } }).result.note).toBe(
        "connection refused"
      );
    });

    it("no tabId during a test_selectors round settles with error (instead of looping forever)", async () => {
      const { state, messaging, controller, sessionId } = setupLoop({
        withTab: false,
      });
      const round1 = testSelectorsTurn(state.get()!, "req-1", [
        { type: "css", value: ".x" },
      ]);
      scriptFetch([round1]);

      await controller.runAgentLoop(sessionId);

      // No DeactivatePicker (no tab to send it to).
      expect(
        messaging.contentCalls.some(
          (c) => c.type === ContentMessageType.DeactivatePicker
        )
      ).toBe(false);
      // Popup still gets a settled error.
      const settled = messaging.popupCalls[0];
      expect(settled?.type).toBe(PopupMessageType.SelectorGenerationSettled);
      expect(
        (settled?.data as { result: { status: string } }).result.status
      ).toBe("error");
    });
  });

  describe("cancel", () => {
    it("cancelling between turns terminates without a settle and returns status to idle", async () => {
      const { state, messaging, controller, sessionId } = setupLoop();

      // First fetch resolves after we've cancelled. The fetch script honors
      // the AbortSignal on its first call and throws an AbortError.
      const round1 = testSelectorsTurn(state.get()!, "req-1", [
        { type: "css", value: ".x" },
      ]);
      scriptFetch([round1, doneOk(round1.state)]);

      const run = controller.runAgentLoop(sessionId);
      // Cancel before the first fetch microtask resolves.
      controller.cancel();
      await run;

      expect(controller.getStatus()).toBe("idle");
      // No settle messages were sent — the loop bailed cleanly.
      expect(
        messaging.popupCalls.some(
          (c) => c.type === PopupMessageType.SelectorGenerationSettled
        )
      ).toBe(false);
    });
  });

  describe("openPopup tolerance", () => {
    it("settle completes even when browser.action.openPopup rejects (best-effort affordance)", async () => {
      const { state, messaging, controller, sessionId } = setupLoop();
      scriptFetch([doneOk(state.get()!)]);

      // fakeBrowser doesn't expose browser.action — install a rejecting stub
      // so we explicitly cover the failure path that real browsers can take
      // when the popup-open is not allowed by user-gesture rules.
      (browser as unknown as { action: unknown }).action = {
        openPopup: vi
          .fn()
          .mockRejectedValue(new Error("user gesture required")),
      };

      await controller.runAgentLoop(sessionId);

      // Settle still ran end-to-end.
      expect(messaging.popupCalls[0]?.type).toBe(
        PopupMessageType.SelectorGenerationSettled
      );
      expect(controller.getStatus()).toBe("idle");
    });
  });

  describe("single-flight", () => {
    it("a second runAgentLoop call while the first is running throws", async () => {
      const { controller, sessionId } = setupLoop();

      // First call's fetch hangs until the AbortSignal fires — keeps the
      // controller in `running` until we cancel.
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_input: string | URL, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () =>
                reject(new DOMException("aborted", "AbortError"))
              );
            })
        )
      );
      const first = controller.runAgentLoop(sessionId);

      // Yield once so the loop flips status to "running" before the second
      // call is made.
      await Promise.resolve();
      await Promise.resolve();

      await expect(controller.runAgentLoop("sess-other")).rejects.toThrow(
        /already running/i
      );

      // Tidy up the dangling first run.
      controller.cancel();
      await first;
    });
  });
});
