import { AgentLoopController } from "@/lib/agent";
import {
  backgroundHandlers,
  injectIntoOpenTabs,
  installIntunedBridge,
  registerBackgroundHandlers,
  registerPickerContentScript,
  registerSessionTabWatcher,
  type BackgroundContext,
} from "@/lib/background";
import {
  CONTEXT_MENU_ITEMS,
  handleContextMenuClick,
  registerContextMenus,
} from "@/lib/background/contextMenu";
import { createBackgroundMessagingClient } from "@/lib/messaging";
import { SelectorState } from "@/lib/state";

export default defineBackground(() => {
  const state = new SelectorState();
  const messaging = createBackgroundMessagingClient();
  const agentLoopController = new AgentLoopController({
    state,
    backgroundMessagingClient: messaging,
  });

  const context: BackgroundContext = {
    state,
    agentLoopController,
    backgroundMessagingClient: messaging,
  };

  void state.hydrate();

  registerBackgroundHandlers(backgroundHandlers, context);
  registerSessionTabWatcher(context);
  registerContextMenus(context);

  void registerPickerContentScript().catch((error) => {
    console.error(
      "[selector-extension] failed to register picker content script; the " +
        "context-menu tracker will not arm on future page loads",
      error
    );
  });

  const sweepOpenTabs = (): void => {
    void injectIntoOpenTabs().catch((error) => {
      console.error(
        "[selector-extension] open-tab picker injection sweep failed",
        error
      );
    });
  };
  browser.runtime.onInstalled.addListener(sweepOpenTabs);
  browser.runtime.onStartup.addListener(sweepOpenTabs);

  // Production bridge for external callers over CDP (Intuned CLI).
  installIntunedBridge(backgroundHandlers, context);

  // e2e only bridge to drive background handlers with the same tab id when having the popup-as-a-tab
  if (import.meta.env.MODE === "e2e") {
    (globalThis as unknown as { __intunedE2E: unknown }).__intunedE2E = {
      handlers: backgroundHandlers,
      context,
      // Simulate a context-menu click without a native menu (Playwright can't
      // open OS menus). Mirrors the `onClicked` listener wiring.
      contextMenuClick: (info: unknown, tab: unknown) =>
        handleContextMenuClick(context, info as never, tab as never),
      // The menu item ids, so e2e can assert the hand-synced literal it clicks
      // (see contextMenu.spec.ts) still matches the source of truth.
      contextMenuItemIds: CONTEXT_MENU_ITEMS.map((i) => i.id),
    };
  }
});
