import {
  ContentMessageType,
  type ActivatePickerResponse,
} from "@/lib/messaging";
import { type PageContext, type SelectorMode } from "@/lib/state";
import type { BackgroundContext } from "@/lib/background";
import { seedSelectorSession } from "../seedSession";

/**
 * Session-start core shared by the popup path (`StartPickerSession`) and the
 * programmatic path (`StartPickerSessionForTab`): cancel any in-flight loop,
 * seed a fresh "picking" session, and activate the picker in the target tab.
 *
 * Activation is verified: a missing content script (tab opened before install,
 * restricted page) or an `ok: false` response clears the seeded session and
 * throws, so callers never end up with a zombie "picking" session nobody can
 * interact with.
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
    throw new Error(`Picker could not attach to tab ${tabId}: ${response.reason}`);
  }

  return { sessionId };
}
