import { AgentLoopController } from "@/lib/agent";
import {
  backgroundHandlers,
  installIntunedBridge,
  registerBackgroundHandlers,
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
import { BackgroundTelemetryClient } from "@/lib/telemetry/client";
import { setTelemetrySink } from "@/lib/telemetry/api";
import { reportGlobalErrors } from "@/lib/telemetry/globalErrors";

export default defineBackground(() => {
  const state = new SelectorState();
  const messaging = createBackgroundMessagingClient();

  // Single App Insights egress for the whole extension. Registered as the api.ts
  // sink so background-originated trackEvent/trackException (registerHandlers,
  // fetchIntunedApi, …) route here; content/popup forward over messaging. init()
  // is async — calls before it resolves are safe no-ops.
  const telemetry = new BackgroundTelemetryClient();
  setTelemetrySink(telemetry);
  void telemetry.init();

  const agentLoopController = new AgentLoopController({
    state,
    backgroundMessagingClient: messaging,
    telemetry,
  });

  const context: BackgroundContext = {
    state,
    agentLoopController,
    backgroundMessagingClient: messaging,
    telemetry,
  };

  // Global safety net. This runs at the top of every worker cold start, so any
  // otherwise-unobserved error/rejection in the worker is captured.
  reportGlobalErrors(self);

  void state.hydrate();

  registerBackgroundHandlers(backgroundHandlers, context);
  registerSessionTabWatcher(context);
  registerContextMenus(context);

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
