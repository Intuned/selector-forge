import { BackgroundMessageType } from "@/lib/messaging";
import type { BackgroundHandlers } from "@/lib/background";

import { handleBootstrapPopup } from "./bootstrapPopup";
import { handleStartPickerSession } from "./startSelectorPickerSession";
import { handleStartAgent } from "./startAgent";
import { handleReportPickerError } from "./reportPickerError";
import {
  handleInitializeAuth,
  handleSignIn,
  handleSignOut,
  handleSetApiKey,
} from "./auth";
import { handleCancelPickerSession } from "./cancelSelectorPickerSession";
import { handleGetSelectorCreationUsage } from "./usage";
import { handleStartPickerSessionForTab } from "./startPickerSessionForTab";
import { handleGetSessionState } from "./getSessionState";
import { handleHighlightSelector } from "./highlightSelector";
import { handleSubmitSelectorFeedback } from "./submitSelectorFeedback";

export const backgroundHandlers: BackgroundHandlers = {
  [BackgroundMessageType.BootstrapPopup]: handleBootstrapPopup,
  [BackgroundMessageType.StartPickerSession]: handleStartPickerSession,
  [BackgroundMessageType.CancelPickerSession]: handleCancelPickerSession,
  [BackgroundMessageType.StartAgent]: handleStartAgent,
  [BackgroundMessageType.ReportPickerError]: handleReportPickerError,
  [BackgroundMessageType.InitializeAuth]: handleInitializeAuth,
  [BackgroundMessageType.SignIn]: handleSignIn,
  [BackgroundMessageType.SignOut]: handleSignOut,
  [BackgroundMessageType.SetApiKey]: handleSetApiKey,
  [BackgroundMessageType.GetSelectorCreationUsage]: handleGetSelectorCreationUsage,
  [BackgroundMessageType.HighlightSelector]: handleHighlightSelector,
  [BackgroundMessageType.SubmitSelectorFeedback]: handleSubmitSelectorFeedback,
  [BackgroundMessageType.StartPickerSessionForTab]: handleStartPickerSessionForTab,
  [BackgroundMessageType.GetSessionState]: handleGetSessionState,
};
