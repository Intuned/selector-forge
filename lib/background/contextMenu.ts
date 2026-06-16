import { ContentMessageType, type ContextMenuItem } from "@/lib/messaging";
import type { PageContext } from "@/lib/state";
import type { BackgroundContext } from "./context";
import { seedSelectorSession } from "./seedSession";

/**
 * Page right-click entry. Right-clicking any element surfaces a "Selector Forge"
 * submenu whose items each run the same selector pipeline the popup uses. The
 * submenu is data-driven (see `CONTEXT_MENU_ITEMS`): a new single-style action is
 * just an entry there, but an action with different content-side behavior also
 * needs a branch in `processContextMenuItem.ts` (which today rejects any
 * non-`single` mode). Today it holds the single-element item only.
 *
 * MV3 notes:
 *   - The menu is (re)created in `runtime.onInstalled`: the service worker can be
 *     evicted and respawned, and `contextMenus.create` throws on duplicate ids,
 *     so creation must NOT run on every wakeup.
 *   - The `onClicked` listener is registered at top level so a click can wake an
 *     evicted worker.
 */

const CONTEXT_MENU_ROOT_ID = "selector-forge";

// One entry per submenu item; `mode` is the action it maps to. Drives both the
// menu build and the click→item lookup; the content side (processContextMenuItem)
// maps `mode` to behavior. The whole item travels in the message.
export const CONTEXT_MENU_ITEMS: ContextMenuItem[] = [
  { id: "selector-forge:single", title: "Single element", mode: "single" },
];

// Derive the click payload + tab types from the listener itself, so we don't
// depend on a globally-available `chrome` namespace (WXT types live on `browser`).
type ContextMenuClickListener = Parameters<
  typeof browser.contextMenus.onClicked.addListener
>[0];
type ContextMenuClickInfo = Parameters<ContextMenuClickListener>[0];
type ContextMenuClickTab = Parameters<ContextMenuClickListener>[1];

/** (Re)create the "Selector Forge" submenu. Safe to call repeatedly. */
export function createContextMenus(): void {
  // Clear first so a reload/update can't collide with stale ids.
  browser.contextMenus.removeAll(() => {
    browser.contextMenus.create({
      id: CONTEXT_MENU_ROOT_ID,
      title: "Selector Forge",
      contexts: ["all"],
    });
    for (const item of CONTEXT_MENU_ITEMS) {
      browser.contextMenus.create({
        id: item.id,
        parentId: CONTEXT_MENU_ROOT_ID,
        title: item.title,
        contexts: ["all"],
      });
    }
  });
}

function pageContextFromClick(
  info: ContextMenuClickInfo,
  tab: ContextMenuClickTab
): PageContext | null {
  const url = info.pageUrl ?? tab?.url;
  if (!url) return null;
  try {
    return {
      url,
      origin: new URL(url).origin,
      title: tab?.title,
      capturedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Drive a selector session from a context-menu click: abort any in-flight loop,
 * seed a fresh session for the clicked item's mode, then forward the whole item
 * to the content script in the right-clicked frame. On success the content script
 * fires `StartAgent` itself (same as the overlay's Done); on failure (including
 * the send rejecting for a frame with no content script) we tear the seeded
 * session back down here, where the state lives. Exported so e2e can exercise the
 * path without a native menu click.
 */
export async function handleContextMenuClick(
  ctx: BackgroundContext,
  info: ContextMenuClickInfo,
  tab: ContextMenuClickTab
): Promise<void> {
  const item = CONTEXT_MENU_ITEMS.find((i) => i.id === info.menuItemId);
  if (!item) return; // not one of ours

  const { state, agentLoopController, backgroundMessagingClient } = ctx;

  const tabId = tab?.id ?? null;
  const page = pageContextFromClick(info, tab);
  if (tabId == null || !page) {
    console.warn(
      "[selector-extension] context menu click without a usable tab/page"
    );
    return;
  }

  // Route to the frame that was actually right-clicked (0 = main frame). The
  // content script only runs in the top frame today, so a subframe click targets
  // a frame with no receiver: the send rejects and we fall through to cleanup —
  // fail-safe, rather than adopting a stale top-frame target.
  const frameId = info.frameId ?? 0;

  // Wait for state hydration before seeding, exactly like the background message
  // handlers do (see registerBackgroundHandlers). On a cold worker wake an
  // in-flight hydrate() could otherwise restore a persisted snapshot *after* we
  // seed and clobber the new session id, so StartAgent would be ignored and the
  // generating overlay would hang.
  await state.ready;

  agentLoopController.cancel();
  const sessionId = seedSelectorSession(state, {
    tabId,
    mode: item.mode,
    page,
  });

  // Tear the seeded session back down on failure — but only if it's still ours.
  // `sendMessageToContent` is awaited, so another session (a popup start or a
  // second right-click) can be seeded in the meantime; clearing then would wipe
  // the newer session. Every other cleanup site guards the same way (see
  // handleCancelPickerSession). We also tell the clicked frame to drop any
  // overlay we mounted, so a failure can't leave the "Generating…" overlay hung;
  // that send harmlessly rejects if the frame is gone / never had a receiver.
  const teardownIfStillOurs = async (): Promise<void> => {
    if (state.get()?.sessionId !== sessionId) return;
    agentLoopController.cancel();
    state.clear();
    try {
      await backgroundMessagingClient.sendMessageToContent(
        tabId,
        ContentMessageType.DeactivatePicker,
        { sessionId },
        frameId
      );
    } catch {
      // frame already gone (navigated/closed) or never had a receiver.
    }
  };

  try {
    const result = await backgroundMessagingClient.sendMessageToContent(
      tabId,
      ContentMessageType.ProcessContextMenuItem,
      { sessionId, item },
      frameId
    );
    if (!result.ok) {
      await teardownIfStillOurs();
      console.warn(
        "[selector-extension] context menu item processing failed:",
        result.reason
      );
    }
  } catch (error) {
    await teardownIfStillOurs();
    console.error(
      "[selector-extension] context menu session failed to start",
      error
    );
  }
}

/**
 * Wire the menu lifecycle. Call once from the background entrypoint with the
 * shared context so a click can drive a session against the right-clicked tab.
 */
export function registerContextMenus(ctx: BackgroundContext): void {
  browser.runtime.onInstalled.addListener(() => {
    createContextMenus();
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    void handleContextMenuClick(ctx, info, tab);
  });
}
