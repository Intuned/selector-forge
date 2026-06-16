import type { BackgroundMessageType } from "@/lib/messaging";
import type { BackgroundHandler } from "@/lib/background";

/**
 * Poll target for external callers (CLI bridge): returns the current session
 * state, or null when no session exists. Survives worker eviction — the state
 * singleton rehydrates from `chrome.storage.session` before handlers run.
 */
export const handleGetSessionState: BackgroundHandler<
  BackgroundMessageType.GetSessionState
> = (_data, { state }) => state.get();
