import {
  ApiKeyAuthProvider,
  setApiKeyCredentials,
} from "./providers/apiKeyProvider";
import {
  openSignInPage,
  openSignOutPage,
  SessionAuthProvider,
} from "./providers/sessionProvider";
import { TokenAuthProvider } from "./providers/tokenProvider";
import {
  clearMethod,
  getCachedWorkspaceName,
  getMethod,
  setCachedWorkspaceName,
  setMethod,
  setToken,
} from "./storage";
import {
  AuthRequestError,
  type AuthIdentity,
  type AuthMethod,
  type AuthProvider,
  type AuthState,
} from "./types";
import { fetchWorkspaceName } from "../graphql/workspace";

/**
 * Resolves auth from the explicitly stored method (see getMethod in ./storage):
 * a configured method (token/api-key) is authoritative and used completely; when
 * nothing is configured, auth falls back to the browser session. There is no
 * priority probing — the stored field is the single source of truth.
 */

const providers: Record<AuthMethod, AuthProvider> = {
  token: new TokenAuthProvider(),
  "api-key": new ApiKeyAuthProvider(),
  session: new SessionAuthProvider(),
};

/** The configured method's provider, or session when nothing is configured. */
async function getActiveProvider(): Promise<AuthProvider> {
  const method = await getMethod();
  return method ? providers[method] : providers.session;
}

/**
 * Wipe every provider's stored credentials. Used when abandoning the active method
 * (sign-out, switch to browser session) so no API key or token lingers on disk —
 * including stale material from a method that was configured earlier but isn't active.
 */
async function clearAllCredentials(): Promise<void> {
  await Promise.all(
    Object.values(providers).map((provider) => provider.clearCredentials())
  );
}

/**
 * Resolve the workspace name from its id and merge it into the identity. Tokens
 * carry only the workspace id, so the human-readable name comes from GraphQL.
 * Best-effort: a failed/empty lookup leaves the identity unchanged rather than
 * failing auth.
 */
async function withWorkspaceName(
  identity: AuthIdentity | null,
  accessToken: string
): Promise<AuthIdentity | null> {
  if (!identity?.workspaceId || identity.workspaceName) return identity;
  // Cached name short-circuits the GraphQL round-trip on every bootstrap.
  const cached = await getCachedWorkspaceName(identity.workspaceId);
  if (cached) return { ...identity, workspaceName: cached };
  try {
    const name = await fetchWorkspaceName(accessToken, identity.workspaceId);
    if (!name) return identity;
    await setCachedWorkspaceName(identity.workspaceId, name);
    return { ...identity, workspaceName: name };
  } catch (error) {
    console.debug("[selector-extension] workspace name lookup failed", error);
    return identity;
  }
}

/**
 * Resolve the active method into a state for the popup:
 *   - signed out -> `{ authenticated: false }`
 *   - configured but rejected (bad API key, expired token) -> adds `error`
 *   - network failure -> rethrows (UI shows a connectivity error)
 */
export async function initAuth(): Promise<AuthState> {
  const provider = await getActiveProvider();
  try {
    const resolution = await provider.resolve();
    if (resolution.status === "unauthenticated") {
      return {
        authenticated: false,
        method: provider.type,
        identity: null,
        hasToken: false,
      };
    }
    return {
      authenticated: true,
      method: provider.type,
      identity: await withWorkspaceName(
        resolution.identity,
        resolution.credentials.accessToken
      ),
      hasToken: !!resolution.credentials.accessToken,
    };
  } catch (error) {
    if (error instanceof AuthRequestError && typeof error.status === "number") {
      // Configured but rejected by the server (bad key, expired token, ...).
      return {
        authenticated: false,
        method: provider.type,
        identity: null,
        hasToken: false,
        error: error.message,
      };
    }
    throw error; // network/unknown
  }
}

/** Bearer access token from the active provider (for API calls). */
export async function getAccessToken(): Promise<string> {
  const provider = await getActiveProvider();
  const credentials = await provider.getCredentials();
  return credentials.accessToken;
}

/**
 * Force a fresh bearer from the active provider, bypassing its cache (e.g. after a
 * downstream 401). Falls back to {@link getCredentials} for providers that don't cache.
 */
export async function refreshAccessToken(): Promise<string> {
  const provider = await getActiveProvider();
  const credentials = provider.refreshCredentials
    ? await provider.refreshCredentials()
    : await provider.getCredentials();
  return credentials.accessToken;
}

/**
 * REST auth headers from the active method: `x-api-key` (api-key) or Bearer (token).
 * Session auth returns undefined — there is nothing to attach; callers must send the
 * request with `credentials: "include"` so the browser injects the session cookie.
 * (The session bearer exists for the GraphQL/Apollo client, not REST.)
 */
export async function getApiHeaders(): Promise<
  Record<string, string> | undefined
> {
  const provider = await getActiveProvider();
  if (provider.getApiHeaders) return provider.getApiHeaders();
}

/**
 * Query params REST must append. No active method currently needs any: the
 * api-key method's workspace is resolved server-side from the key, and the
 * other methods carry their workspace in the bearer claims or the session.
 * Returns undefined unless a provider opts in.
 */
export async function getApiQueryParams(): Promise<
  Record<string, string> | undefined
> {
  const provider = await getActiveProvider();
  if (provider.getApiQueryParams) return provider.getApiQueryParams();
}

/**
 * Configure API-key auth: validate + store the key (throws on a bad key, leaving
 * the active method unchanged), then make api-key the active method.
 */
export async function configureApiKey(apiKey: string): Promise<AuthState> {
  await setApiKeyCredentials(apiKey);
  await setMethod("api-key");
  return initAuth();
}

/**
 * Configure token auth (programmatic / e2e seam): store the raw JWT and make it
 * the active method. An expired/unreadable token surfaces as an error from
 * initAuth rather than silently falling back.
 */
export async function configureToken(token: string): Promise<AuthState> {
  const trimmed = token.trim();
  if (!trimmed) throw new AuthRequestError("Token is required");
  await setToken(trimmed);
  await setMethod("token");
  return initAuth();
}

/**
 * Switch to browser/session auth: wipe every provider's stored credentials (so no API
 * key or token is left behind), drop the configured method (session becomes active), and
 * open the login page.
 */
export async function useBrowserSession(): Promise<void> {
  await clearAllCredentials();
  await clearMethod();
  await openSignInPage();
}

/**
 * Sign out of the active method. Wipes every provider's stored credentials (leaving no
 * key or token on disk) and clears the active method. For session this opens the logout
 * page and reports signed-out; for token/api-key auth falls back to the browser session.
 */
export async function signOut(): Promise<AuthState> {
  const provider = await getActiveProvider();
  await clearAllCredentials();
  await clearMethod();

  if (provider.type === "session") {
    await openSignOutPage();
    return {
      authenticated: false,
      method: "session",
      identity: null,
      hasToken: false,
    };
  }
  return initAuth();
}
