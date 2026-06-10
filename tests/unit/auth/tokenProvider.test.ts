import { fakeBrowser } from "@webext-core/fake-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TokenAuthProvider } from "../../../lib/auth/providers/tokenProvider";
import { getToken, setToken } from "../../../lib/auth/storage";
import { AuthRequestError } from "../../../lib/auth/types";

/**
 * The token method is authoritative — a bad/expired token must NOT silently
 * fall back to another provider. These tests pin that contract.
 */

const HASURA_CLAIM = "https://hasura.io/jwt/claims";

function encodeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

describe("TokenAuthProvider", () => {
  let provider: TokenAuthProvider;

  beforeEach(() => {
    fakeBrowser.reset();
    provider = new TokenAuthProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("resolve", () => {
    it("is unauthenticated when no token is stored", async () => {
      await expect(provider.resolve()).resolves.toEqual({ status: "unauthenticated" });
    });

    it("throws (does NOT fall back) when the stored token is unreadable", async () => {
      await setToken("not-a-jwt");
      await expect(provider.resolve()).rejects.toMatchObject({
        name: "AuthRequestError",
        status: 401,
        message: expect.stringMatching(/unreadable/i),
      });
    });

    it("throws when the stored token has already expired", async () => {
      const expiredAt = Math.floor(Date.now() / 1000) - 60;
      await setToken(encodeJwt({ exp: expiredAt }));
      await expect(provider.resolve()).rejects.toMatchObject({
        name: "AuthRequestError",
        status: 401,
        message: expect.stringMatching(/expired/i),
      });
    });

    it("returns authenticated with claims + expiry from the JWT", async () => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const token = encodeJwt({
        exp,
        [HASURA_CLAIM]: {
          "x-hasura-workspace-id": "ws-1",
          "x-hasura-email": "ada@example.com",
        },
      });
      await setToken(token);

      await expect(provider.resolve()).resolves.toEqual({
        status: "authenticated",
        credentials: {
          accessToken: token,
          workspaceId: "ws-1",
          expiresAt: exp * 1000,
        },
        identity: {
          email: "ada@example.com",
          workspaceId: "ws-1",
        },
      });
    });
  });

  describe("getCredentials", () => {
    it("throws AuthRequestError(401) when there is no usable token", async () => {
      await expect(provider.getCredentials()).rejects.toBeInstanceOf(AuthRequestError);
    });

    it("returns the same credentials resolve() produces", async () => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const token = encodeJwt({
        exp,
        [HASURA_CLAIM]: { "x-hasura-workspace-id": "ws-9" },
      });
      await setToken(token);

      await expect(provider.getCredentials()).resolves.toEqual({
        accessToken: token,
        workspaceId: "ws-9",
        expiresAt: exp * 1000,
      });
    });
  });

  describe("clearCredentials", () => {
    it("removes the stored token", async () => {
      await setToken("anything");
      await provider.clearCredentials();
      await expect(getToken()).resolves.toBeNull();
    });
  });
});
