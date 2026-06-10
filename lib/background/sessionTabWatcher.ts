import { ContentMessageType } from "@/lib/messaging";
import type { BackgroundContext } from "./context";

// watches the target tab of the current session, and handles any tab updates or removal
export function registerSessionTabWatcher(ctx: BackgroundContext): void {
  const { state, agentLoopController, backgroundMessagingClient } = ctx;

  const sessionTabId = (): number | null => {
    const session = state.get();
    if (!session) return null;
    if (state.isSelectorSessionSettled()) {
      return null;
    }
    return state.getMeta()?.tabId ?? null;
  };

  browser.tabs.onRemoved.addListener(async (tabId) => {
    await state.ready;
    if (tabId !== sessionTabId()) return;
    const session = state.get();
    if (!session) return;
    void agentLoopController.settleWithError(
      session.sessionId,
      "Target tab was closed."
    );
  });

  browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    await state.ready;
    if (tabId !== sessionTabId()) return;
    if (changeInfo.status !== "complete") return;

    const session = state.get();
    if (!session) return;

    let currentUrl: string | undefined;
    try {
      const tab = await browser.tabs.get(tabId);
      currentUrl = tab.url;
    } catch {
      // Tab vanished between the event and the get — onRemoved will handle it.
      return;
    }
    if (!currentUrl) return;

    let currentOrigin: string;
    try {
      currentOrigin = new URL(currentUrl).origin;
    } catch {
      currentOrigin = "";
    }

    if (currentOrigin !== session.page.origin) {
      void agentLoopController.settleWithError(
        session.sessionId,
        "Target page navigated away. Please restart the selector."
      );
      return;
    }

    // Same-origin reload: re-sync the content side from BG state. The handler
    // remounts the interactive overlay if we're still in `picking`, or
    // re-anchors the ElementRegistry from `targets[].elementXpath` if the
    // agent loop is already running. A failed re-anchor (e.g. xpath no longer
    // resolves on the new DOM) settles the session with a clear reason.
    let response;
    try {
      response = await backgroundMessagingClient.sendMessageToContent(
        tabId,
        ContentMessageType.ActivatePicker,
        {
          sessionId: session.sessionId,
          mode: session.mode,
          status: session.status,
          targets: session.targets,
        }
      );
    } catch (error) {
      console.debug(
        "[selector-extension] re-sync picker after reload failed",
        error
      );
      return;
    }

    if (!response.ok) {
      void agentLoopController.settleWithError(
        session.sessionId,
        response.reason
      );
    }
  });
}
