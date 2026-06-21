import { fakeBrowser } from "@webext-core/fake-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiKeyAuthProvider,
  setApiKeyCredentials,
} from "../../../lib/auth/providers/apiKeyProvider";
import {
  getApiKey,
  getApiKeyBearerCache,
  setApiKey,
  setApiKeyBearerCache,
} from "../../../lib/auth/storage";

/**
 * Covers two surfaces:
 *   - `setApiKeyCredentials` — the popup "Save API key" path. Validation and
 *     server-error translation must produce typed AuthRequestError so the UI
 *     can render a meaningful message.
 *   - `ApiKeyAuthProvider` — the steady-state path. A valid cached bearer is
 *     reused; an about-to-expire one triggers a fresh exchange; the api key
 *     is the auth header for REST calls.
 *
 * The key is exchanged at the workspace-less `/api/v1/auth` endpoint; the
 * workspace id is read back from the JWT claims, never collected from the user.
 */

const HASURA_CLAIM = "https://hasura.io/jwt/claims";

function encodeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

function freshJwt(): { token: string; exp: number } {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    token: encodeJwt({
      exp,
      [HASURA_CLAIM]: {
        "x-hasura-workspace-id": "ws-from-jwt",
        "x-hasura-email": "ada@example.com",
      },
    }),
    exp,
  };
}

type Route = { status?: number; body?: unknown; networkError?: boolean };

function installExchange(route: Route | Route[]): ReturnType<typeof vi.fn> {
  const routes = Array.isArray(route) ? route : [route];
  let index = 0;
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (!url.includes("/api/v1/auth")) {
      throw new Error(`unexpected fetch: ${url}`);
    }
    const r = routes[Math.min(index++, routes.length - 1)];
    if (r.networkError) throw new TypeError("network down");
    const status = r.status ?? 200;
    return {
      status,
      ok: status >= 200 && status < 300,
      statusText: status === 200 ? "OK" : "Error",
      json: async () => r.body,
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("setApiKeyCredentials", () => {
  beforeEach(() => fakeBrowser.reset());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects an empty api key without touching the network", async () => {
    const fetchMock = installExchange({ status: 200 });
    await expect(setApiKeyCredentials("   ")).rejects.toMatchObject({
      name: "AuthRequestError",
      message: expect.stringMatching(/api key is required/i),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("persists the key and exchanged bearer on success", async () => {
    const { token, exp } = freshJwt();
    installExchange({ body: { token } });

    await setApiKeyCredentials("in1_good");

    await expect(getApiKey()).resolves.toBe("in1_good");
    await expect(getApiKeyBearerCache()).resolves.toEqual({
      token,
      // Expiry derived from the JWT itself, not the default TTL.
      expiresAt: exp * 1000,
    });
  });

  it("translates a 401 into AuthRequestError(401) with a user-facing message", async () => {
    installExchange({ status: 401 });
    await expect(setApiKeyCredentials("in1_bad")).rejects.toMatchObject({
      name: "AuthRequestError",
      status: 401,
      message: expect.stringMatching(/api key/i),
    });
    await expect(getApiKey()).resolves.toBeNull();
  });

  it("wraps a network failure in AuthRequestError without a status code", async () => {
    installExchange({ networkError: true });
    await expect(setApiKeyCredentials("in1_good")).rejects.toMatchObject({
      name: "AuthRequestError",
      status: undefined,
      message: expect.stringMatching(/network/i),
    });
  });

  it("rejects a 200 response whose token is missing", async () => {
    installExchange({ body: {} });
    await expect(setApiKeyCredentials("in1_good")).rejects.toMatchObject({
      name: "AuthRequestError",
      message: expect.stringMatching(/invalid response/i),
    });
  });

  it("rejects a 200 response whose token is unreadable (cannot be decoded)", async () => {
    installExchange({ body: { token: "not-a-jwt" } });
    await expect(setApiKeyCredentials("in1_good")).rejects.toMatchObject({
      name: "AuthRequestError",
      message: expect.stringMatching(/unreadable/i),
    });
  });

  it("rejects a 200 response whose token is already expired", async () => {
    const expiredExp = Math.floor(Date.now() / 1000) - 60;
    installExchange({ body: { token: encodeJwt({ exp: expiredExp }) } });
    await expect(setApiKeyCredentials("in1_good")).rejects.toMatchObject({
      name: "AuthRequestError",
      message: expect.stringMatching(/already-expired/i),
    });
  });
});

describe("ApiKeyAuthProvider", () => {
  let provider: ApiKeyAuthProvider;

  beforeEach(() => {
    fakeBrowser.reset();
    provider = new ApiKeyAuthProvider();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("resolve", () => {
    it("is unauthenticated when no api key is stored", async () => {
      await expect(provider.resolve()).resolves.toEqual({ status: "unauthenticated" });
    });

    it("returns the cached bearer without hitting the network when it's still fresh", async () => {
      const { token } = freshJwt();
      await setApiKey("in1_good");
      await setApiKeyBearerCache(token, Date.now() + 10 * 60_000);
      const fetchMock = installExchange({ status: 500 }); // would explode if called

      const resolution = await provider.resolve();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(resolution).toMatchObject({
        status: "authenticated",
        // Workspace id comes from the JWT claims, not from any stored value.
        credentials: { accessToken: token, workspaceId: "ws-from-jwt" },
        identity: { email: "ada@example.com", workspaceId: "ws-from-jwt" },
      });
    });

    it("re-exchanges when the cached bearer is inside the refresh-before-expiry skew", async () => {
      const { token: fresh } = freshJwt();
      await setApiKey("in1_good");
      // Cache expires in 5s; skew is 30s — counts as expired.
      await setApiKeyBearerCache("stale-token", Date.now() + 5_000);
      const fetchMock = installExchange({ body: { token: fresh } });

      const resolution = await provider.resolve();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(resolution).toMatchObject({
        status: "authenticated",
        credentials: { accessToken: fresh },
      });
      // The new bearer is what the next call would serve.
      await expect(getApiKeyBearerCache()).resolves.toMatchObject({ token: fresh });
    });
  });

  describe("getApiHeaders", () => {
    it("returns the x-api-key header when configured", async () => {
      await setApiKey("in1_good");
      await expect(provider.getApiHeaders()).resolves.toEqual({ "x-api-key": "in1_good" });
    });

    it("throws when the api key is not configured", async () => {
      await expect(provider.getApiHeaders()).rejects.toMatchObject({
        name: "AuthRequestError",
        status: 401,
      });
    });
  });

  describe("clearCredentials", () => {
    it("removes the stored api key", async () => {
      await setApiKey("in1_good");
      await provider.clearCredentials();
      await expect(getApiKey()).resolves.toBeNull();
    });
  });
});
