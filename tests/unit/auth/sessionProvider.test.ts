import { fakeBrowser } from "@webext-core/fake-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionAuthProvider } from "../../../lib/auth/providers/sessionProvider";
import {
  getSessionBearerCache,
  setSessionBearerCache,
} from "../../../lib/auth/storage";
import { AuthRequestError } from "../../../lib/auth/types";

/**
 * Coverage for the session provider's caching + refresh behavior, plus the
 * "session auth without bearer" consistency fix: when `/api/auth/me` succeeds but
 * `/api/auth/session` yields no token, `resolve()` reports `unauthenticated` (consistent
 * with `getCredentials()` throwing) and no hollow token is cached.
 */

type RouteResponse = {
  status?: number;
  body?: unknown;
  networkError?: boolean;
};

const USER = {
  sub: "auth0|1",
  email: "ada@example.com",
  name: "Ada",
  nickname: "ada",
  picture: "https://img/ada.png",
  workspaceId: "ws-1",
};

function respond(route: RouteResponse): Response {
  if (route.networkError) throw new TypeError("network down");
  const status = route.status ?? 200;
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => route.body,
  } as Response;
}

/**
 * Stub `fetch`, routing `/api/auth/me` and `/api/auth/session` to canned responses.
 * `session` may be an array consumed one-per-call (to vary the token across refetches).
 */
function installFetch(routes: {
  me?: RouteResponse;
  session?: RouteResponse | RouteResponse[];
}) {
  let sessionIndex = 0;
  const pickSession = (): RouteResponse | undefined => {
    const s = routes.session;
    if (Array.isArray(s)) return s[Math.min(sessionIndex++, s.length - 1)];
    sessionIndex++;
    return s;
  };

  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.endsWith("/api/auth/me")) return respond(routes.me ?? { status: 401 });
    if (url.endsWith("/api/auth/session")) {
      const route = pickSession();
      if (!route) throw new Error("no /api/auth/session route configured");
      return respond(route);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** How many times a given endpoint was fetched. */
function callsTo(fetchMock: ReturnType<typeof installFetch>, suffix: string): number {
  return fetchMock.mock.calls.filter((call) =>
    String(call[0]).endsWith(suffix)
  ).length;
}

describe("SessionAuthProvider", () => {
  let provider: SessionAuthProvider;

  beforeEach(() => {
    fakeBrowser.reset();
    provider = new SessionAuthProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("resolve", () => {
    it("returns unauthenticated when /api/auth/me is unauthenticated (401)", async () => {
      installFetch({ me: { status: 401 } });

      await expect(provider.resolve()).resolves.toEqual({
        status: "unauthenticated",
      });
    });

    it("returns authenticated with the real token and identity, caching the bearer", async () => {
      installFetch({
        me: { body: USER },
        session: { body: { accessToken: "tok-123", refreshToken: "ref" } },
      });

      await expect(provider.resolve()).resolves.toEqual({
        status: "authenticated",
        credentials: { accessToken: "tok-123", workspaceId: "ws-1" },
        identity: {
          name: "Ada",
          nickname: "ada",
          email: "ada@example.com",
          picture: "https://img/ada.png",
          workspaceId: "ws-1",
        },
      });
      const cached = await getSessionBearerCache();
      expect(cached?.token).toBe("tok-123");
      expect(cached?.expiresAt).toBeGreaterThan(Date.now());
    });

    it("returns unauthenticated when the session response carries no access token", async () => {
      installFetch({ me: { body: USER }, session: { body: {} } });

      await expect(provider.resolve()).resolves.toEqual({
        status: "unauthenticated",
      });
      await expect(getSessionBearerCache()).resolves.toBeNull();
    });

    it("returns unauthenticated when the session endpoint is 401", async () => {
      installFetch({ me: { body: USER }, session: { status: 401 } });

      await expect(provider.resolve()).resolves.toEqual({
        status: "unauthenticated",
      });
      await expect(getSessionBearerCache()).resolves.toBeNull();
    });

    it("propagates a real session-endpoint failure (500) instead of reporting unauthenticated", async () => {
      installFetch({ me: { body: USER }, session: { status: 500 } });

      await expect(provider.resolve()).rejects.toBeInstanceOf(AuthRequestError);
    });

    it("agrees with getCredentials: no bearer => resolve unauthenticated AND getCredentials throws", async () => {
      installFetch({ me: { body: USER }, session: { body: {} } });

      await expect(provider.resolve()).resolves.toEqual({
        status: "unauthenticated",
      });
      await expect(provider.getCredentials()).rejects.toMatchObject({
        name: "AuthRequestError",
        status: 401,
        message: "Not signed in",
      });
    });
  });

  describe("caching", () => {
    it("serves a cached bearer instead of re-fetching /api/auth/session", async () => {
      const fetchMock = installFetch({
        session: { body: { accessToken: "tok-cache" } },
      });

      const first = await provider.getCredentials();
      const second = await provider.getCredentials();

      expect(first.accessToken).toBe("tok-cache");
      expect(second.accessToken).toBe("tok-cache");
      // Second call is a cache hit — the session endpoint is only hit once.
      expect(callsTo(fetchMock, "/api/auth/session")).toBe(1);
    });

    it("resolve reuses the cached bearer (no extra /api/auth/session call)", async () => {
      const fetchMock = installFetch({
        me: { body: USER },
        session: { body: { accessToken: "tok-cache" } },
      });

      await provider.getCredentials(); // warms the cache (1 session call)
      await provider.resolve(); // hits /api/auth/me, but the bearer is cached

      expect(callsTo(fetchMock, "/api/auth/session")).toBe(1);
      expect(callsTo(fetchMock, "/api/auth/me")).toBe(1);
    });

    it("re-fetches when the cached bearer is past its expiry (minus skew)", async () => {
      const fetchMock = installFetch({
        session: { body: { accessToken: "tok-fresh" } },
      });
      // Pre-seed an already-expired cache entry.
      await setSessionBearerCache("tok-stale", Date.now() - 1_000);

      const credentials = await provider.getCredentials();

      expect(credentials.accessToken).toBe("tok-fresh");
      expect(callsTo(fetchMock, "/api/auth/session")).toBe(1);
    });

    it("clearCredentials drops the cached bearer", async () => {
      installFetch({ session: { body: { accessToken: "tok-cache" } } });

      await provider.getCredentials();
      await expect(getSessionBearerCache()).resolves.not.toBeNull();

      await provider.clearCredentials();
      await expect(getSessionBearerCache()).resolves.toBeNull();
    });
  });

  describe("refreshCredentials", () => {
    it("bypasses the cache, re-fetches, and replaces the cached bearer", async () => {
      const fetchMock = installFetch({
        session: [
          { body: { accessToken: "tok-1" } },
          { body: { accessToken: "tok-2" } },
        ],
      });

      const initial = await provider.getCredentials(); // caches tok-1
      const refreshed = await provider.refreshCredentials(); // forces a refetch

      expect(initial.accessToken).toBe("tok-1");
      expect(refreshed.accessToken).toBe("tok-2");
      expect(callsTo(fetchMock, "/api/auth/session")).toBe(2);
      await expect(getSessionBearerCache()).resolves.toMatchObject({
        token: "tok-2",
      });
    });

    it("throws when a forced refresh yields no token", async () => {
      installFetch({ session: { body: {} } });

      await expect(provider.refreshCredentials()).rejects.toMatchObject({
        name: "AuthRequestError",
        status: 401,
      });
      await expect(getSessionBearerCache()).resolves.toBeNull();
    });
  });
});
