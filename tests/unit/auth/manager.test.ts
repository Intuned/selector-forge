import { fakeBrowser } from "@webext-core/fake-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAccessToken,
  refreshAccessToken,
  signOut,
  useBrowserSession,
} from "../../../lib/auth/manager";
import {
  getApiKey,
  getApiKeyBearerCache,
  getMethod,
  getSessionBearerCache,
  getToken,
  getWorkspaceId,
  setApiKey,
  setApiKeyBearerCache,
  setMethod,
  setSessionBearerCache,
  setToken,
} from "../../../lib/auth/storage";

/**
 * Wiring test for the exposed `refreshAccessToken()`: with no configured method it targets
 * the session provider and forces a fresh `/api/auth/session` fetch, bypassing the cache.
 */
function installSessionFetch(tokens: string[]) {
  let index = 0;
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input);
    const body = url.endsWith("/api/auth/session")
      ? { accessToken: tokens[Math.min(index++, tokens.length - 1)] }
      : undefined;
    return { status: 200, ok: true, json: async () => body } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("refreshAccessToken", () => {
  beforeEach(() => {
    fakeBrowser.reset(); // no stored method => session provider
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("force-refreshes the session bearer, returning a freshly fetched token", async () => {
    const fetchMock = installSessionFetch(["tok-1", "tok-2"]);

    const first = await getAccessToken(); // caches tok-1
    const refreshed = await refreshAccessToken(); // bypasses cache

    expect(first).toBe("tok-1");
    expect(refreshed).toBe("tok-2");
    expect(
      fetchMock.mock.calls.filter((c) =>
        String(c[0]).endsWith("/api/auth/session")
      ).length
    ).toBe(2);
  });
});

/** Persist credential material for every method, plus a stale token from a prior method. */
async function seedAllCredentials() {
  await setToken("jwt-token");
  await setApiKey("api-key", "ws-9");
  await setApiKeyBearerCache("api-bearer", Date.now() + 60_000);
  await setSessionBearerCache("session-bearer", Date.now() + 60_000);
}

async function expectNoCredentialsRemain() {
  expect(await getToken()).toBeNull();
  expect(await getApiKey()).toBeNull();
  expect(await getWorkspaceId()).toBeNull();
  expect(await getApiKeyBearerCache()).toBeNull();
  expect(await getSessionBearerCache()).toBeNull();
}

describe("credential cleanup on method switch / sign-out", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    // Don't actually open browser tabs from openSignInPage / openSignOutPage.
    vi.spyOn(fakeBrowser.tabs, "create").mockResolvedValue(
      {} as Awaited<ReturnType<typeof fakeBrowser.tabs.create>>
    );
    // signOut falls back to initAuth (session resolve); keep it off the network.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 401, ok: false, json: async () => null }) as Response)
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("useBrowserSession wipes every provider's stored material, not just the active one", async () => {
    await seedAllCredentials();
    await setMethod("api-key"); // api-key is active; auth.token is stale leftover

    await useBrowserSession();

    await expectNoCredentialsRemain();
    expect(await getMethod()).toBeNull(); // session becomes the active method
    expect(fakeBrowser.tabs.create).toHaveBeenCalled(); // login page opened
  });

  it("signOut wipes every provider's stored material, including stale leftovers", async () => {
    await seedAllCredentials();
    await setMethod("api-key");

    await signOut();

    await expectNoCredentialsRemain();
    expect(await getMethod()).toBeNull();
  });
});
