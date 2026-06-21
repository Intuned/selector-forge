import { vi } from "vitest";
import type { AgentLoopController } from "../../../lib/agent";
import type {
  BackgroundContext,
  BackgroundHandlerContext,
  MessageSender,
} from "../../../lib/background";
import { ContentMessageType } from "../../../lib/messaging";
import type {
  BackgroundMessagingClient,
  ContentProtocolMap,
  PopupMessageType,
  PopupProtocolMap,
} from "../../../lib/messaging";
import { SelectorState } from "../../../lib/state";
import type { PageContext, SelectorCreateState } from "../../../lib/state";
import type { GetDataType, GetReturnType } from "@webext-core/messaging";
import type {
  BackgroundTelemetry,
  TelemetryRole,
  TrackEventInput,
  TrackExceptionInput,
} from "../../../lib/telemetry/types";

// harness for testing background handlers in isolation, with fakes for the messaging client and agent loop controller, and some state fixtures.

// ─── messaging fake ──────────────────────────────────────────────────────────

export interface ToContentCall<
  K extends ContentMessageType = ContentMessageType
> {
  tabId: number;
  type: K;
  data: GetDataType<ContentProtocolMap[K]>;
}

export interface ToPopupCall<K extends PopupMessageType = PopupMessageType> {
  type: K;
  data: GetDataType<PopupProtocolMap[K]>;
}

export interface FakeMessagingClient extends BackgroundMessagingClient {
  /** Every `toContent` call, in order. */
  contentCalls: ToContentCall[];
  /** Every `toPopup` call, in order. */
  popupCalls: ToPopupCall[];
  /** Per-type scripted response for `toContent`. Last in wins. */
  whenContent<K extends ContentMessageType>(
    type: K,
    impl: (call: ToContentCall<K>) => GetReturnType<ContentProtocolMap[K]>
  ): void;
  /** Force the next `toContent` call of `type` to reject with `error`. */
  rejectContent(type: ContentMessageType, error: Error): void;
}

export function createFakeMessagingClient(): FakeMessagingClient {
  const contentCalls: ToContentCall[] = [];
  const popupCalls: ToPopupCall[] = [];
  const scripts = new Map<
    ContentMessageType,
    (call: ToContentCall) => unknown
  >();
  const oneShotRejections = new Map<ContentMessageType, Error>();

  return {
    contentCalls,
    popupCalls,
    whenContent(type, impl) {
      scripts.set(type, impl as (call: ToContentCall) => unknown);
    },
    rejectContent(type, error) {
      oneShotRejections.set(type, error);
    },
    sendMessageToContent: (async (tabId, type, data) => {
      const call = { tabId, type, data } as ToContentCall;
      contentCalls.push(call);
      const rejection = oneShotRejections.get(type);
      if (rejection) {
        oneShotRejections.delete(type);
        throw rejection;
      }
      const impl = scripts.get(type);
      if (impl) return impl(call);
      // ActivatePicker responses are verified by the session-start core;
      // default to success so tests only script the failure cases.
      if (type === ContentMessageType.ActivatePicker) return { ok: true };
      return undefined;
    }) as BackgroundMessagingClient["sendMessageToContent"],
    sendMessageToPopup: (async (type, data) => {
      popupCalls.push({ type, data } as ToPopupCall);
      return undefined;
    }) as BackgroundMessagingClient["sendMessageToPopup"],
  };
}

// ─── telemetry fake ──────────────────────────────────────────────────────────

export interface RecordedEvent {
  input: TrackEventInput;
  role?: TelemetryRole;
}
export interface RecordedException {
  input: TrackExceptionInput;
  role?: TelemetryRole;
}

export interface FakeTelemetry extends BackgroundTelemetry {
  events: RecordedEvent[];
  exceptions: RecordedException[];
}

export function createFakeTelemetry(): FakeTelemetry {
  const events: RecordedEvent[] = [];
  const exceptions: RecordedException[] = [];
  return {
    events,
    exceptions,
    trackEvent(input, role) {
      events.push({ input, role });
    },
    trackException(input, role) {
      exceptions.push({ input, role });
    },
  };
}

// ─── agent-loop fake (for handler tests; the real one has its own tests) ─────

export interface FakeAgentLoopController extends AgentLoopController {
  cancelCalls: number;
  runCalls: string[];
}

export function createFakeAgentLoopController(): FakeAgentLoopController {
  const cancelCalls = { count: 0 };
  const runCalls: string[] = [];
  const fake = {
    cancelCalls: 0,
    runCalls,
    getStatus: () => "idle" as const,
    cancel() {
      cancelCalls.count++;
      fake.cancelCalls = cancelCalls.count;
    },
    async runAgentLoop(sessionId: string) {
      runCalls.push(sessionId);
    },
    // The internal fields aren't exercised by handler tests; cast through.
  } as unknown as FakeAgentLoopController;
  return fake;
}

// ─── context builder ─────────────────────────────────────────────────────────

export interface HarnessOptions {
  state?: SelectorState;
  messaging?: FakeMessagingClient;
  agentLoop?: AgentLoopController;
  sender?: MessageSender;
  telemetry?: FakeTelemetry;
}

export interface Harness {
  state: SelectorState;
  messaging: FakeMessagingClient;
  agentLoop: FakeAgentLoopController;
  telemetry: FakeTelemetry;
  context: BackgroundHandlerContext;
}

export function createHarness(opts: HarnessOptions = {}): Harness {
  const state = opts.state ?? new SelectorState();
  const messaging = opts.messaging ?? createFakeMessagingClient();
  const agentLoop = (opts.agentLoop ??
    createFakeAgentLoopController()) as FakeAgentLoopController;
  const telemetry = opts.telemetry ?? createFakeTelemetry();
  const baseContext: BackgroundContext = {
    state,
    agentLoopController: agentLoop,
    backgroundMessagingClient: messaging,
    telemetry,
  };
  const context: BackgroundHandlerContext = {
    ...baseContext,
    sender: opts.sender as MessageSender,
  };
  return { state, messaging, agentLoop, telemetry, context };
}

// ─── state fixtures ──────────────────────────────────────────────────────────

export const PAGE: PageContext = {
  url: "https://example.com/",
  origin: "https://example.com",
  title: "Example",
  capturedAt: "2026-06-07T00:00:00.000Z",
};

export function makeInflightSession(
  overrides: Partial<SelectorCreateState> = {}
): SelectorCreateState {
  return {
    schemaVersion: 2,
    sessionId: "sess-1",
    mode: "single",
    status: "running",
    page: PAGE,
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

// ─── sender fixture ──────────────────────────────────────────────────────────

export function senderFromTab(tabId: number): MessageSender {
  return { tab: { id: tabId } } as MessageSender;
}

// ─── console silencer (settle() logs) ────────────────────────────────────────

export function silenceConsole(): void {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
}
