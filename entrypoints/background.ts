import {
  configureApiKey,
  initAuth,
  signOut,
  useBrowserSession,
} from "../lib/auth";
import { registerHandlers, type StartPickResult } from "../lib/messaging/messages";
import type { PickMode } from "../lib/types";

export default defineBackground(() => {
  registerHandlers({
    startPick: (mode) => handleStartPick(mode),
    selectorRequest: () => {}, // stub
    openPopup: () => {}, // stub
    // Runs in the background so the dev.intuned.io cookie attaches. Returning the
    // promise lets errors reject on the caller, so the UI can tell "signed out"
    // from "server down".
    initializeAuth: () => initAuth(),
    signIn: () => void useBrowserSession(), // switch to session + open login tab
    setApiKey: ({ apiKey, workspaceId }) =>
      configureApiKey(apiKey, workspaceId),
    signOut: () => signOut(),
  });
});

async function handleStartPick(_mode: PickMode): Promise<StartPickResult> {
  try {
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
