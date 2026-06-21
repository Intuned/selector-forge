import { getApiBase } from "@/lib/config";
import { decodeJwt, isJwtExpired } from "../jwt";
import {
  clearApiKey,
  getApiKey,
  getApiKeyBearerCache,
  setApiKey,
  setApiKeyBearerCache,
} from "../storage";
import {
  AuthRequestError,
  type AuthCredentials,
  type AuthProvider,
  type AuthResolution,
} from "../types";

/**
 * API-key auth (mirrors the CLI's ApiKeyAuthProvider). The key is exchanged for a
 * short-lived JWT at `GET {apiBase}/api/v1/auth` (`x-api-key` header) and cached.
 * The backend resolves the owning workspace from the key, so no workspace id is
 * collected — it is read back from the JWT claims. REST uses the key directly;
 * Bearer flows use the JWT.
 */

const DEFAULT_TOKEN_TTL_MS = 3 * 60 * 1000;
const REFRESH_BEFORE_EXPIRY_MS = 30 * 1000;

/**
 * Exchange an API key for a JWT. Throws with a status on 401 (and on a 2xx that
 * returns an unreadable or already-expired token), without one on network errors.
 */
async function exchangeApiKey(apiKey: string): Promise<string> {
  let response: Response;
  try {
    const apiBase = await getApiBase();
    response = await fetch(`${apiBase}/api/v1/auth`, {
      method: "GET",
      headers: { "x-api-key": apiKey },
    });
  } catch (error) {
    throw new AuthRequestError(
      `Network error exchanging API key: ${String(error)}`
    );
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new AuthRequestError(
        "API key authentication failed. Verify the API key is valid.",
        401
      );
    }
    throw new AuthRequestError(
      `API key authentication failed: ${response.status} ${response.statusText}`,
      response.status
    );
  }

  const data = (await response.json()) as { token?: unknown };
  if (typeof data.token !== "string") {
    throw new AuthRequestError(
      "Invalid response from API key auth endpoint.",
      response.status
    );
  }

  // The exchanged token must be a decodable, non-expired JWT. Otherwise we cannot
  // trust its expiry and would fabricate one (then serve a dead bearer); treat that
  // as a server-side failure rather than laundering it into a "valid" credential.
  const decoded = decodeJwt(data.token);
  if (!decoded) {
    throw new AuthRequestError(
      "API key auth endpoint returned an unreadable token.",
      response.status
    );
  }
  if (isJwtExpired(decoded)) {
    throw new AuthRequestError(
      "API key auth endpoint returned an already-expired token.",
      response.status
    );
  }
  return data.token;
}

/**
 * Expiry (ms epoch) from the token's `exp`. Tokens reaching this are pre-validated
 * by exchangeApiKey, so the default TTL only applies to a valid JWT that genuinely
 * omits `exp` (matching the CLI's 3-minute default).
 */
function expiryFromToken(token: string): number {
  const decoded = decodeJwt(token);
  return decoded?.exp ? decoded.exp * 1000 : Date.now() + DEFAULT_TOKEN_TTL_MS;
}

/** Validate + persist an API key (exchanging it for a bearer). Throws on invalid credentials. */
export async function setApiKeyCredentials(apiKey: string): Promise<void> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) throw new AuthRequestError("API key is required");

  const token = await exchangeApiKey(trimmedKey);
  await setApiKey(trimmedKey);
  await setApiKeyBearerCache(token, expiryFromToken(token));
}

export class ApiKeyAuthProvider implements AuthProvider {
  readonly type = "api-key" as const;

  /** A valid cached bearer, or a freshly exchanged one. */
  private async getBearer(apiKey: string): Promise<string> {
    const cached = await getApiKeyBearerCache();
    if (cached && Date.now() < cached.expiresAt - REFRESH_BEFORE_EXPIRY_MS) {
      return cached.token;
    }
    const token = await exchangeApiKey(apiKey);
    await setApiKeyBearerCache(token, expiryFromToken(token));
    return token;
  }

  async resolve(): Promise<AuthResolution> {
    const apiKey = await getApiKey();
    if (!apiKey) return { status: "unauthenticated" };

    const token = await this.getBearer(apiKey);
    const decoded = decodeJwt(token);
    return {
      status: "authenticated",
      credentials: {
        accessToken: token,
        workspaceId: decoded?.claims.workspaceId,
        expiresAt: expiryFromToken(token),
      },
      identity: {
        email: decoded?.claims.email,
        workspaceId: decoded?.claims.workspaceId,
      },
    };
  }

  async getCredentials(): Promise<AuthCredentials> {
    const resolution = await this.resolve();
    if (resolution.status !== "authenticated") {
      throw new AuthRequestError("API key is not configured", 401);
    }
    return resolution.credentials;
  }

  async getApiHeaders(): Promise<Record<string, string>> {
    const apiKey = await getApiKey();
    if (!apiKey) throw new AuthRequestError("API key is not configured", 401);
    return { "x-api-key": apiKey };
  }

  async clearCredentials(): Promise<void> {
    await clearApiKey();
  }
}
