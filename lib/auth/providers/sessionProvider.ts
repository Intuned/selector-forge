import { getApiBase } from "@/lib/config";
import { decodeJwt } from "../jwt";
import {
  clearSessionBearerCache,
  getSessionBearerCache,
  setSessionBearerCache,
} from "../storage";
import {
  AuthRequestError,
  type AuthCredentials,
  type AuthProvider,
  type AuthResolution,
  type AuthUser,
  type SessionTokens,
} from "../types";

/**
 * Browser/cookie login (the always-available fallback). Uses the configured
 * app.intuned.io session cookie; fetches MUST run in the background worker so
 * the HttpOnly cookie attaches.
 */

/** Default bearer lifetime when the session token carries no readable `exp`. */
const DEFAULT_SESSION_TOKEN_TTL_MS = 3 * 60 * 1000;
/** Refresh this far ahead of expiry to absorb clock skew / request latency. */
const REFRESH_BEFORE_EXPIRY_MS = 30 * 1000;

/** Expiry (ms epoch) from the token's `exp`, or a default TTL when it has none. */
function sessionTokenExpiry(token: string): number {
  const decoded = decodeJwt(token);
  return decoded?.exp
    ? decoded.exp * 1000
    : Date.now() + DEFAULT_SESSION_TOKEN_TTL_MS;
}

/** `GET /api/auth/me`: 200 -> user, 401 -> null, else throws. */
export async function fetchUser(): Promise<AuthUser | null> {
  let response: Response;
  try {
    response = await fetch(`${await getApiBase()}/api/auth/me`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new AuthRequestError(
      `Network error calling /api/auth/me: ${String(error)}`
    );
  }

  if (response.status === 401) return null;
  if (!response.ok)
    throw new AuthRequestError("/api/auth/me failed", response.status);
  return (await response.json()) as AuthUser;
}

/** `GET /api/auth/session`: 200 -> tokens, 401 -> null, else throws. */
export async function fetchSession(): Promise<SessionTokens | null> {
  let response: Response;
  try {
    response = await fetch(`${await getApiBase()}/api/auth/session`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new AuthRequestError(
      `Network error calling /api/auth/session: ${String(error)}`
    );
  }

  if (response.status === 401) return null;
  if (!response.ok)
    throw new AuthRequestError("/api/auth/session failed", response.status);
  return (await response.json()) as SessionTokens;
}

/** Opens the login page; completing it sets the session cookie. */
export async function openSignInPage(): Promise<void> {
  await browser.tabs.create({
    url: `${await getApiBase()}/api/auth/login`,
    active: true,
  });
}

/** Opens the logout page to clear the server session cookie. */
export async function openSignOutPage(): Promise<void> {
  await browser.tabs.create({
    url: `${await getApiBase()}/api/auth/logout`,
    active: true,
  });
}

export class SessionAuthProvider implements AuthProvider {
  readonly type = "session" as const;

  /**
   * A valid cached session bearer, or a freshly fetched one. Pass `forceRefresh` to skip
   * the cache and re-fetch (see {@link refreshCredentials}). Returns `null` when the
   * session yields no usable token (signed out), clearing any stale cache.
   */
  private async getSessionBearer(forceRefresh = false): Promise<string | null> {
    if (!forceRefresh) {
      const cached = await getSessionBearerCache();
      if (cached && Date.now() < cached.expiresAt - REFRESH_BEFORE_EXPIRY_MS) {
        return cached.token;
      }
    }

    const tokens = await fetchSession();
    if (!tokens?.accessToken) {
      await clearSessionBearerCache();
      return null;
    }

    const accessToken = tokens.accessToken;
    await setSessionBearerCache(accessToken, sessionTokenExpiry(accessToken));
    return accessToken;
  }

  private toCredentials(token: string): AuthCredentials {
    const decoded = decodeJwt(token);
    return {
      accessToken: token,
      workspaceId: decoded?.claims.workspaceId,
      expiresAt: decoded?.exp ? decoded.exp * 1000 : undefined,
    };
  }

  async resolve(): Promise<AuthResolution> {
    const user = await fetchUser();
    if (!user) return { status: "unauthenticated" };

    const accessToken = await this.getSessionBearer();
    if (!accessToken) return { status: "unauthenticated" };

    return {
      status: "authenticated",
      credentials: { accessToken, workspaceId: user.workspaceId },
      identity: {
        name: user.name,
        nickname: user.nickname,
        email: user.email,
        picture: user.picture,
        workspaceId: user.workspaceId,
      },
    };
  }

  async getCredentials(): Promise<AuthCredentials> {
    const token = await this.getSessionBearer();
    if (!token) throw new AuthRequestError("Not signed in", 401);
    return this.toCredentials(token);
  }

  /**
   * Force a fresh `/api/auth/session` fetch, replacing the cached bearer. Use when a
   * cached token was rejected (e.g. a 401 from a downstream API) to obtain a new one.
   */
  async refreshCredentials(): Promise<AuthCredentials> {
    const token = await this.getSessionBearer(true);
    if (!token) throw new AuthRequestError("Not signed in", 401);
    return this.toCredentials(token);
  }

  async clearCredentials(): Promise<void> {
    await clearSessionBearerCache();
  }
}
