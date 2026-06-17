import type { AuthMethod } from "./types";

/**
 * `browser.storage.local` access for auth state. Local (not sync) keeps tokens
 * on-device and readable from both the popup and the service worker (which has no
 * `window.localStorage` and loses in-memory state when idle).
 */

const KEY = {
  /** Active auth method ("token" | "api-key" | "session"); absent => session. */
  method: "auth.method",
  /** Raw ASM JWT — set programmatically, never via the UI. */
  token: "auth.token",
  /** Pasted API key. */
  apiKey: "auth.apiKey",
  /** Workspace id paired with the API key. */
  workspaceId: "auth.workspaceId",
  /** Cached session bearer + its expiry (ms epoch). */
  sessionAccessToken: "auth.accessToken",
  sessionAccessTokenExpiresAt: "auth.accessToken.expiresAt",
  /** Cached bearer exchanged from the API key + its expiry (ms epoch). */
  apiKeyCacheToken: "auth.apiKey.cache.token",
  apiKeyCacheExpiresAt: "auth.apiKey.cache.expiresAt",
  /** Resolved workspace names keyed by workspace id (`Record<string,string>`). */
  workspaceNameById: "auth.workspaceNameById",
} as const;

async function getString(key: string): Promise<string | null> {
  const out = await browser.storage.local.get(key);
  const value = out[key];
  return typeof value === "string" ? value : null;
}

async function getNumber(key: string): Promise<number | null> {
  const out = await browser.storage.local.get(key);
  const value = out[key];
  return typeof value === "number" ? value : null;
}

export interface ApiKeyBearerCache {
  token: string;
  expiresAt: number;
}

// --- active method ---

/** The configured auth method, or null (=> session) when nothing is set. */
export async function getMethod(): Promise<AuthMethod | null> {
  const value = await getString(KEY.method);
  return value === "token" || value === "api-key" || value === "session" ? value : null;
}

export function setMethod(method: AuthMethod): Promise<void> {
  return browser.storage.local.set({ [KEY.method]: method });
}

export function clearMethod(): Promise<void> {
  return browser.storage.local.remove(KEY.method);
}

// --- token (programmatic) ---

export function getToken(): Promise<string | null> {
  return getString(KEY.token);
}

export function setToken(token: string): Promise<void> {
  return browser.storage.local.set({ [KEY.token]: token });
}

export function clearToken(): Promise<void> {
  return browser.storage.local.remove(KEY.token);
}

// --- api key ---

export function getApiKey(): Promise<string | null> {
  return getString(KEY.apiKey);
}

export function getWorkspaceId(): Promise<string | null> {
  return getString(KEY.workspaceId);
}

export function setApiKey(apiKey: string, workspaceId: string): Promise<void> {
  return browser.storage.local.set({ [KEY.apiKey]: apiKey, [KEY.workspaceId]: workspaceId });
}

export function clearApiKey(): Promise<void> {
  return browser.storage.local.remove([
    KEY.apiKey,
    KEY.workspaceId,
    KEY.apiKeyCacheToken,
    KEY.apiKeyCacheExpiresAt,
  ]);
}

export async function getApiKeyBearerCache(): Promise<ApiKeyBearerCache | null> {
  const token = await getString(KEY.apiKeyCacheToken);
  const expiresAt = await getNumber(KEY.apiKeyCacheExpiresAt);
  if (!token || expiresAt === null) return null;
  return { token, expiresAt };
}

export function setApiKeyBearerCache(token: string, expiresAt: number): Promise<void> {
  return browser.storage.local.set({
    [KEY.apiKeyCacheToken]: token,
    [KEY.apiKeyCacheExpiresAt]: expiresAt,
  });
}

export function clearApiKeyBearerCache(): Promise<void> {
  return browser.storage.local.remove([KEY.apiKeyCacheToken, KEY.apiKeyCacheExpiresAt]);
}

// --- session bearer ---

export interface SessionBearerCache {
  token: string;
  expiresAt: number;
}

export async function getSessionBearerCache(): Promise<SessionBearerCache | null> {
  const token = await getString(KEY.sessionAccessToken);
  const expiresAt = await getNumber(KEY.sessionAccessTokenExpiresAt);
  if (!token || expiresAt === null) return null;
  return { token, expiresAt };
}

export function setSessionBearerCache(token: string, expiresAt: number): Promise<void> {
  return browser.storage.local.set({
    [KEY.sessionAccessToken]: token,
    [KEY.sessionAccessTokenExpiresAt]: expiresAt,
  });
}

export function clearSessionBearerCache(): Promise<void> {
  return browser.storage.local.remove([
    KEY.sessionAccessToken,
    KEY.sessionAccessTokenExpiresAt,
  ]);
}

// --- workspace name cache ---

/**
 * Workspace names come from a GraphQL lookup (tokens carry only the id), so
 * caching them by id keeps that lookup off the bootstrap hot path. A cached name
 * is reused indefinitely, so a rename isn't reflected until this key is cleared —
 * fine in practice, as renames are rare and a stale display name is harmless.
 */
export async function getCachedWorkspaceName(
  workspaceId: string
): Promise<string | null> {
  const out = await browser.storage.local.get(KEY.workspaceNameById);
  const map = out[KEY.workspaceNameById];
  if (map && typeof map === "object") {
    const name = (map as Record<string, unknown>)[workspaceId];
    if (typeof name === "string") return name;
  }
  return null;
}

export async function setCachedWorkspaceName(
  workspaceId: string,
  name: string
): Promise<void> {
  const out = await browser.storage.local.get(KEY.workspaceNameById);
  const existing = out[KEY.workspaceNameById];
  const map: Record<string, string> =
    existing && typeof existing === "object"
      ? (existing as Record<string, string>)
      : {};
  map[workspaceId] = name;
  await browser.storage.local.set({ [KEY.workspaceNameById]: map });
}
