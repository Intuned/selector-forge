import { describe, expect, it } from "vitest";
import { decodeJwt, isJwtExpired } from "../../../lib/auth/jwt";

/**
 * `decodeJwt` is the trust boundary for token-based providers. Every other
 * provider relies on it to surface unreadable / expired tokens as a hard
 * failure rather than letting a hollow bearer through.
 */

const HASURA_CLAIM = "https://hasura.io/jwt/claims";

function encodeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

describe("decodeJwt", () => {
  it("extracts exp and hasura claims from a well-formed token", () => {
    const token = encodeJwt({
      exp: 1_700_000_000,
      [HASURA_CLAIM]: {
        "x-hasura-workspace-id": "ws-1",
        "x-hasura-email": "ada@example.com",
        "x-hasura-user-id": "user-1",
      },
    });

    expect(decodeJwt(token)).toEqual({
      exp: 1_700_000_000,
      claims: {
        workspaceId: "ws-1",
        email: "ada@example.com",
        userId: "user-1",
      },
    });
  });

  it("yields an empty claims object when the hasura namespace is missing", () => {
    const token = encodeJwt({ exp: 123 });
    expect(decodeJwt(token)).toEqual({ exp: 123, claims: {} });
  });

  it("ignores non-string hasura claims (does not coerce numbers/objects)", () => {
    const token = encodeJwt({
      [HASURA_CLAIM]: {
        "x-hasura-workspace-id": 42,
        "x-hasura-email": { not: "a string" },
      },
    });
    expect(decodeJwt(token)?.claims).toEqual({});
  });

  it("returns null for strings that don't look like a JWT", () => {
    expect(decodeJwt("")).toBeNull();
    expect(decodeJwt("not-a-jwt")).toBeNull();
  });

  it("returns null when the payload segment is not valid JSON", () => {
    // valid base64, invalid JSON
    const garbage = btoa("not json {");
    expect(decodeJwt(`header.${garbage}.sig`)).toBeNull();
  });

  it("returns undefined exp when the token omits it (instead of dropping the rest)", () => {
    const token = encodeJwt({ [HASURA_CLAIM]: { "x-hasura-email": "a@b" } });
    const decoded = decodeJwt(token);
    expect(decoded?.exp).toBeUndefined();
    expect(decoded?.claims.email).toBe("a@b");
  });
});

describe("isJwtExpired", () => {
  it("is true when exp*1000 is <= the supplied now", () => {
    const now = 2_000_000_000_000;
    expect(isJwtExpired({ exp: 1_999_999_999, claims: {} }, now)).toBe(true);
  });

  it("is false when exp is in the future", () => {
    const now = 2_000_000_000_000;
    expect(isJwtExpired({ exp: 2_000_000_001, claims: {} }, now)).toBe(false);
  });

  it("is false when exp is absent (caller decides default TTL elsewhere)", () => {
    expect(isJwtExpired({ claims: {} })).toBe(false);
  });
});
