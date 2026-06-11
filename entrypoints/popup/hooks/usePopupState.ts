import { useCallback, useEffect, useState } from "react";
import type {
  FinalSelectorResult,
  SelectorCreateState,
  SelectorHistoryEntry,
  SelectorMode,
} from "@/lib/state";
import type { AuthState } from "@/lib/auth";
import type { SelectorCreationUsage } from "@/lib/graphql/usage";
import { BackgroundMessageType, PopupMessageType } from "@/lib/messaging";
import { messagingClient } from "../messagingClient";
import type { ChipState } from "../types";

export function usePopupState() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [session, setSession] = useState<SelectorCreateState | null>(null);
  const [selectorGenerationError, setSelectorGenerationError] =
    useState<FinalSelectorResult | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [mode, setMode] = useState<SelectorMode>("single");
  const [history, setHistory] = useState<SelectorHistoryEntry[]>([]);
  const [usage, setUsage] = useState<SelectorCreationUsage | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // bootstrap and initialize state from the BG
  const bootstrap = useCallback(async () => {
    setBootstrapError(null);
    try {
      const snapshot = await messagingClient.sendMessageToBackground(
        BackgroundMessageType.BootstrapPopup,
        undefined as never
      );

      const { auth, session, history } = snapshot;
      // set the popup state from the snapshot
      setAuth(auth);
      setSession(session);
      setHistory(history);
      setSelectorGenerationError(
        session?.finalResult?.status === "error" ? session.finalResult : null
      );
    } catch {
      setBootstrapError(
        "Couldn’t reach Intuned. Check your connection and retry."
      );
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // BG-pushed events for live session updates, todO: should we do a long con. model using ports?
  useEffect(() => {
    const unsubscribers = [
      messagingClient.onEvent(
        PopupMessageType.SessionStateChanged,
        ({ session: next }) => {
          setSession(next);
          if (next?.finalResult?.status === "error")
            setSelectorGenerationError(next.finalResult);
        }
      ),
      messagingClient.onEvent(
        PopupMessageType.SelectorGenerationSettled,
        ({ result, historyEntry }) => {
          if (result.status === "error") {
            setSelectorGenerationError(result);
            return;
          }
          if (historyEntry) {
            setHistory((prev) => [
              historyEntry,
              ...prev.filter((e) => e.id !== historyEntry.id),
            ]);
          }
          setSelectorGenerationError(null);
          setShowPicker(false);
        }
      ),
    ];
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, []);

  // Workspace usage for the meter. Fetched once authenticated (and re-fetched on
  // sign-in); failures leave it null so the bar just shows no numbers.
  useEffect(() => {
    if (!auth?.authenticated) {
      setUsage(null);
      return;
    }
    let cancelled = false;
    void messagingClient
      .sendMessageToBackground(
        BackgroundMessageType.GetSelectorCreationUsage,
        undefined as never
      )
      .then((next) => {
        if (!cancelled) setUsage(next);
      })
      .catch(() => {
        /* leave usage null; the meter renders without counts */
      });
    return () => {
      cancelled = true;
    };
  }, [auth?.authenticated]);

  const signOut = useCallback(async () => {
    const state = await messagingClient.sendMessageToBackground(
      BackgroundMessageType.SignOut,
      undefined as never
    );
    setAuth(state);
    setSession(null);
    setSelectorGenerationError(null);
  }, []);

  const startSession = useCallback(async (picked: SelectorMode) => {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.url) return;
    const url = new URL(tab.url);
    try {
      await messagingClient.sendMessageToBackground(
        BackgroundMessageType.StartPickerSession,
        {
          mode: picked,
          page: {
            url: tab.url,
            origin: url.origin,
            title: tab.title,
            capturedAt: new Date().toISOString(),
          },
        }
      );
      window.close();
    } catch {
      /* leaving the popup open is fine; the BG owns error state. */
    }
  }, []);

  const startNew = useCallback(() => {
    setSelectorGenerationError(null);
    setSession(null);
    setShowPicker(true);
  }, []);

  const openPicker = useCallback(() => {
    setSelectorGenerationError(null);
    setSession(null);
    setShowPicker(true);
  }, []);

  const cancelSession = useCallback(async () => {
    const sessionId = session?.sessionId;
    if (sessionId) {
      try {
        await messagingClient.sendMessageToBackground(
          BackgroundMessageType.CancelPickerSession,
          { sessionId }
        );
      } catch {
        /* fall through — local reset below still unblocks the UI */
      }
    }
    setSession(null);
    setSelectorGenerationError(null);
  }, [session?.sessionId]);

  const chipState: ChipState = bootstrapError
    ? "error"
    : auth?.authenticated
    ? "authenticated"
    : auth
    ? "unauthenticated"
    : "unknown";

  return {
    auth,
    session,
    selectorGenerationError,
    bootstrapError,
    mode,
    history,
    usage,
    showPicker,
    chipState,
    authenticated: !!auth?.authenticated,
    setAuth,
    setMode,
    bootstrap,
    signOut,
    startSession,
    startNew,
    openPicker,
    cancelSession,
  };
}
