/**
 * Auth entry point. A provider model (see ./manager) backs three methods: token,
 * api-key, and session. Fetches run in the background worker so the
 * dev.intuned.io session cookie attaches.
 */

export {
  configureApiKey,
  configureToken,
  getAccessToken,
  getApiHeaders,
  initAuth,
  refreshAccessToken,
  signOut,
  useBrowserSession,
} from "./manager";
export { setApiKeyCredentials } from "./providers/apiKeyProvider";
export {
  fetchSession,
  fetchUser,
  openSignInPage,
  openSignOutPage,
} from "./providers/sessionProvider";
export type {
  AuthCredentials,
  AuthIdentity,
  AuthMethod,
  AuthProvider,
  AuthState,
  AuthUser,
  SessionTokens,
} from "./types";
export { AuthRequestError } from "./types";
