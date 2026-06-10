import { decodeJwt, isJwtExpired } from "../jwt";
import { clearToken, getToken } from "../storage";
import {
  type AuthCredentials,
  type AuthProvider,
  type AuthResolution,
  AuthRequestError,
} from "../types";

/**
 * Raw ASM JWT auth (mirrors the CLI's INTUNED_AUTH_TOKEN). A programmatic escape
 * hatch, not shown in the UI — activated by setting the stored method to `token`
 * (e.g. configureToken, or an e2e harness seeding `auth.token` + `auth.method`).
 */
export class TokenAuthProvider implements AuthProvider {
  readonly type = "token" as const;

  async resolve(): Promise<AuthResolution> {
    const token = await getToken();
    if (!token) return { status: "unauthenticated" };

    const decoded = decodeJwt(token);
    // The token method is authoritative: surface a bad/expired token as an error
    // instead of silently falling back to another method.
    if (!decoded) throw new AuthRequestError("INTUNED token is unreadable.", 401);
    if (isJwtExpired(decoded)) throw new AuthRequestError("INTUNED token has expired.", 401);

    return {
      status: "authenticated",
      credentials: {
        accessToken: token,
        workspaceId: decoded.claims.workspaceId,
        expiresAt: decoded.exp ? decoded.exp * 1000 : undefined,
      },
      identity: {
        email: decoded.claims.email,
        workspaceId: decoded.claims.workspaceId,
      },
    };
  }

  async getCredentials(): Promise<AuthCredentials> {
    const resolution = await this.resolve();
    if (resolution.status !== "authenticated") {
      throw new AuthRequestError("INTUNED token is missing or expired", 401);
    }
    return resolution.credentials;
  }

  /** The raw JWT is the only credential — REST sends it as a Bearer (no cookie exists). */
  async getApiHeaders(): Promise<Record<string, string>> {
    const credentials = await this.getCredentials();
    return { Authorization: `Bearer ${credentials.accessToken}` };
  }

  async clearCredentials(): Promise<void> {
    await clearToken();
  }
}
