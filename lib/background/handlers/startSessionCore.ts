import {
  ContentMessageType,
  type ActivatePickerResponse,
} from "@/lib/messaging";
import { type PageContext, type SelectorMode } from "@/lib/state";
import type { BackgroundContext } from "@/lib/background";
import { seedSelectorSession } from "../seedSession";
import { ensureInjectedContentScript } from "../ensureContentScript";

/**
 * Session-start core shared by the popup path (`StartPickerSession`) and the
 * programmatic path (`StartPickerSessionForTab`): cancel any in-flight loop,
 * seed a fresh "picking" session, and activate the picker in the target tab.
 *
 * The picker is injected on demand rather than relied upon to already be there:
 * `ensureInjectedContentScript` guarantees a live content script before we
 * message it, so a tab opened before the extension was installed works without a
 * page reload. Activation is then verified — an `ok: false` response, or the
 * ensure/activate step throwing, clears the seeded session and throws, so
 * callers never end up with a zombie "picking" session nobody can interact with.
 */
export async function seedAndActivateSession(
  args: { mode: SelectorMode; page: PageContext; tabId: number },
  ctx: BackgroundContext
): Promise<{ sessionId: string }> {
  const { mode, page, tabId } = args;
  const { state, agentLoopController, backgroundMessagingClient } = ctx;

  // Abort any in-flight loop from a previous session.
  agentLoopController.cancel();

  const sessionId = seedSelectorSession(state, { tabId, mode, page });

  let response: ActivatePickerResponse;
  try {
    // Make sure the picker is live before we talk to it — a tab open since
    // before the extension was installed has none until we inject one.
    await ensureInjectedContentScript(tabId);
    response = await backgroundMessagingClient.sendMessageToContent(
      tabId,
      ContentMessageType.ActivatePicker,
      { sessionId, mode, status: "picking", targets: [] }
    );
  } catch (error) {
    state.clear();
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Picker could not attach to tab ${tabId} (${message}). Reload the tab and try again.`
    );
  }
  if (!response.ok) {
    state.clear();
    throw new Error(
      `Picker could not attach to tab ${tabId}: ${response.reason}`
    );
  }

  return { sessionId };
}
