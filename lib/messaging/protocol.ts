import type {
  PageContext,
  SelectorCreateState,
  SelectorMode,
  SelectorRecord,
  SelectorResultRecord,
  SelectorStatus,
  TargetRecord,
  FinalSelectorResult,
  SelectorErrorRecord,
  SelectorFeedback,
  SelectorHistoryEntry,
} from "@/lib/state";
import type { AuthState } from "@/lib/auth";
import type { SelectorCreationUsage } from "@/lib/graphql/usage";

/* ──────────────────────────── enums ──────────────────────────────────── */

/** Messages addressed TO the background service worker. */
export enum BackgroundMessageType {
  // popup -> background
  BootstrapPopup = "bg:bootstrapPopup",
  StartPickerSession = "bg:startPickerSession",
  CancelPickerSession = "bg:cancelPickerSession",

  // content -> background
  StartAgent = "bg:startAgent",
  ReportPickerError = "bg:reportPickerError",

  // popup -> background -> content
  HighlightSelector = "bg:highlightSelector",

  // popup -> background -> LangSmith
  SubmitSelectorFeedback = "bg:submitSelectorFeedback",

  // auth (kept on the BG surface — same registration pattern)
  InitializeAuth = "bg:initializeAuth",
  SignIn = "bg:signIn",
  SignOut = "bg:signOut",
  SetApiKey = "bg:setApiKey",

  // billing
  GetSelectorCreationUsage = "bg:getSelectorCreationUsage",
}

// messages addressed to content scripts (from background)
export enum ContentMessageType {
  ActivatePicker = "cs:activatePicker",
  DeactivatePicker = "cs:deactivatePicker",
  TestSelectors = "cs:testSelectors",
  HighlightSelector = "cs:highlightSelector",
}

// messages addressed to the popup UI (from background)
export enum PopupMessageType {
  SessionStateChanged = "popup:sessionStateChanged",
  SelectorGenerationSettled = "popup:selectorGenerationSettled",
}

/* ───────────────────── background protocol map ───────────────────────── */

export interface StartSelectorSessionRequest {
  mode: SelectorMode;
  page: PageContext;
}
export interface StartSelectorSessionResponse {
  sessionId: string;
}

export interface SubmitTargetSelectionRequest {
  sessionId: string;
  targets: TargetRecord[];
  inspectionView: string;
}

export interface SubmitBrowserTestResultRequest {
  sessionId: string;
  requestId: string;
  selectorResults: SelectorResultRecord[];
  elementHtmlById?: Record<string, string>;
}

export interface ReportPickerErrorRequest {
  sessionId: string;
  error: SelectorErrorRecord;
}

export interface SubmitSelectorFeedbackRequest {
  langsmithRunId: string;
  value: SelectorFeedback;
  comment?: string;
}
export interface SubmitSelectorFeedbackResult {
  ok: boolean;
}

export interface BootstrapPopupResponse {
  auth: AuthState;
  session: SelectorCreateState | null;
  history: SelectorHistoryEntry[];
}

export type BackgroundProtocolMap = {
  [BackgroundMessageType.BootstrapPopup]: () => BootstrapPopupResponse;

  [BackgroundMessageType.StartPickerSession]: (
    data: StartSelectorSessionRequest
  ) => StartSelectorSessionResponse;

  [BackgroundMessageType.CancelPickerSession]: (data: {
    sessionId: string;
  }) => void;

  [BackgroundMessageType.StartAgent]: (
    data: SubmitTargetSelectionRequest
  ) => void;

  [BackgroundMessageType.ReportPickerError]: (
    data: ReportPickerErrorRequest
  ) => void;

  [BackgroundMessageType.HighlightSelector]: (
    data: HighlightSelectorRequest
  ) => HighlightSelectorResult;

  [BackgroundMessageType.SubmitSelectorFeedback]: (
    data: SubmitSelectorFeedbackRequest
  ) => SubmitSelectorFeedbackResult;

  // auth surface (one-to-one with the legacy handlers)
  [BackgroundMessageType.InitializeAuth]: () => AuthState;
  [BackgroundMessageType.SignIn]: () => void;
  [BackgroundMessageType.SignOut]: () => AuthState;
  [BackgroundMessageType.SetApiKey]: (data: {
    apiKey: string;
    workspaceId: string;
  }) => AuthState;

  [BackgroundMessageType.GetSelectorCreationUsage]: () => SelectorCreationUsage;
};

/* ───────────────────── content protocol map ──────────────────────────── */

export interface ActivatePickerRequest {
  sessionId: string;
  mode: SelectorMode;
  // Snapshot from the BG state singleton. The content side renders against
  // this rather than holding its own phase model: on `picking` it mounts the
  // interactive overlay with a fresh registry; on `running` / `awaiting_browser`
  // it skips the overlay and re-anchors the registry from `targets` so the
  // next TestSelectors round still resolves the agent's stored element ids.
  status: SelectorStatus;
  targets: TargetRecord[];
}

export type ActivatePickerResponse =
  | { ok: true }
  | { ok: false; reason: string };

export interface TestSelectorsRequest {
  sessionId: string;
  requestId: string;
  selectors: SelectorRecord[];
  needHtmlForFeedback?: boolean;
}

export interface HighlightSelectorRequest {
  selector: SelectorRecord;
}

export interface HighlightSelectorResult {
  /** Number of elements the selector matched on the active page (0 = none). */
  matchCount: number;
}

export type ContentProtocolMap = {
  [ContentMessageType.ActivatePicker]: (
    data: ActivatePickerRequest
  ) => ActivatePickerResponse;
  [ContentMessageType.DeactivatePicker]: (data: { sessionId: string }) => void;

  [ContentMessageType.TestSelectors]: (data: TestSelectorsRequest) => {
    selectorResults: SelectorResultRecord[];
    elementHtmlById?: Record<string, string>;
  };

  [ContentMessageType.HighlightSelector]: (
    data: HighlightSelectorRequest
  ) => HighlightSelectorResult;
};

/* ───────────────────── popup protocol map ────────────────────────────── */

export interface SessionStateChangedEvent {
  session: SelectorCreateState | null;
}

export interface SelectorGenerationSettledEvent {
  sessionId: string;
  result: FinalSelectorResult;
  // new selector generated history entry
  historyEntry?: SelectorHistoryEntry;
}

export type PopupProtocolMap = {
  [PopupMessageType.SessionStateChanged]: (
    data: SessionStateChangedEvent
  ) => void;
  [PopupMessageType.SelectorGenerationSettled]: (
    data: SelectorGenerationSettledEvent
  ) => void;
};

// surfaces

import { defineExtensionMessaging } from "@webext-core/messaging";

export const backgroundProtocol =
  defineExtensionMessaging<BackgroundProtocolMap>();

export const contentProtocol = defineExtensionMessaging<ContentProtocolMap>();

export const popupProtocol = defineExtensionMessaging<PopupProtocolMap>();
