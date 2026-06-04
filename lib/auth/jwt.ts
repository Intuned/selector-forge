/**
 * Minimal JWT payload decoding — reads claims (workspace id, email, expiry), never
 * verifies signatures. `atob`/`TextDecoder` work in both the popup and the worker.
 */

export interface HasuraClaims {
  workspaceId?: string;
  email?: string;
  userId?: string;
}

export interface DecodedJwt {
  /** Expiry in seconds (raw `exp` claim), if present. */
  exp?: number;
  claims: HasuraClaims;
}

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Decode a JWT's payload and extract Hasura claims + expiry.
 * Returns `null` for anything that isn't a parseable JWT payload.
 */
export function decodeJwt(token: string): DecodedJwt | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>;
  } catch {
    return null;
  }

  const hasura =
    (payload["https://hasura.io/jwt/claims"] as Record<string, unknown> | undefined) ?? {};

  const asString = (value: unknown): string | undefined =>
    typeof value === "string" ? value : undefined;

  return {
    exp: typeof payload.exp === "number" ? payload.exp : undefined,
    claims: {
      workspaceId: asString(hasura["x-hasura-workspace-id"]),
      email: asString(hasura["x-hasura-email"]),
      userId: asString(hasura["x-hasura-user-id"]),
    },
  };
}

/** True when the JWT carries an `exp` that is already in the past. */
export function isJwtExpired(decoded: DecodedJwt, nowMs: number = Date.now()): boolean {
  return typeof decoded.exp === "number" && decoded.exp * 1000 <= nowMs;
}
