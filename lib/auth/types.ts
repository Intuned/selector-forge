/**
 * Auth methods. The active method is stored explicitly (see getMethod in ./storage):
 *   - token   — programmatic ASM JWT, not shown in the UI
 *   - api-key — pasted API key (workspace resolved server-side from the key)
 *   - session — browser/cookie login, the default when nothing is configured
 * A configured method (token/api-key) is authoritative and used completely; only
 * an unconfigured state falls back to session. No priority probing.
 */

export type AuthMethod = "token" | "api-key" | "session";

/** Bearer credentials a provider can produce for API/GraphQL calls. */
export interface AuthCredentials {
  /** JWT to send as `Authorization: Bearer ...`. */
  accessToken: string;
  /** Workspace id, from JWT claims or the session profile. */
  workspaceId?: string;
  /** Expiry in ms epoch; undefined when unknown (e.g. cookie session). */
  expiresAt?: number;
}

/** Display info shown in the popup. Richness depends on the method. */
export interface AuthIdentity {
  name?: string;
  nickname?: string;
  email?: string;
  picture?: string;
  workspaceId?: string;
  workspaceName?: string;
}

/** Result of fully resolving a provider (credentials + identity). */
export type AuthResolution =
  | {
      status: "authenticated";
      credentials: AuthCredentials;
      identity: AuthIdentity | null;
    }
  | { status: "unauthenticated" };

/** High-level snapshot the popup renders. */
export interface AuthState {
  authenticated: boolean;
  /** Active method, even when configured but failing. */
  method: AuthMethod | null;
  identity: AuthIdentity | null;
  /** Whether a usable bearer token was obtained this run. */
  hasToken: boolean;
  /** Set when the active method is configured but failed (e.g. bad API key). */
  error?: string;
}

/** Auth0 profile from `GET /api/auth/me` (session method). */
export interface AuthUser {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  nickname?: string;
  picture?: string;
  updated_at?: string;
  sid?: string;
  workspaceId?: string;
  userId?: string;
}

/** Token payload from `GET /api/auth/session`. */
export interface SessionTokens {
  accessToken: string;
  refreshToken?: string;
}

/**
 * A failure that is NOT "signed out":
 *   - `status` set (401/400): server rejected the credentials (show inline).
 *   - `status` undefined: network error (show a connectivity message).
 */
export class AuthRequestError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "AuthRequestError";
    this.status = status;
  }
}

/** A single authentication strategy. Selected by the stored active method. */
export interface AuthProvider {
  readonly type: AuthMethod;

  /** Full resolution for the UI. Throws {@link AuthRequestError} on real failures. */
  resolve(): Promise<AuthResolution>;

  /** Bearer credentials for API calls. Throws if unavailable. */
  getCredentials(): Promise<AuthCredentials>;

  /**
   * Force-refresh and return bearer credentials, bypassing any cache (e.g. re-fetch the
   * session token). Optional: providers without a refreshable cache omit it, and callers
   * fall back to {@link getCredentials}.
   */
  refreshCredentials?(): Promise<AuthCredentials>;

  /**
   * Auth headers for REST (api-key: `x-api-key`; token: Bearer). Session omits this:
   * REST then relies on the browser-injected cookie (`credentials: "include"`).
   */
  getApiHeaders?(): Promise<Record<string, string>>;

  /**
   * Query params REST must append. Optional — providers that need none omit it.
   * (The api-key method appends nothing: the backend resolves the workspace from
   * the key itself.)
   */
  getApiQueryParams?(): Promise<Record<string, string>>;

  /**
   * Remove every piece of credential material this provider persists. Required so that
   * switching methods or signing out can guarantee nothing sensitive is left on disk.
   */
  clearCredentials(): Promise<void>;
}
