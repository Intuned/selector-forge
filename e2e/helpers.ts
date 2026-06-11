import type { BrowserContext, Page, Worker } from "@playwright/test";

// mock chrome APIs that the extension uses on the test environment
declare const chrome: {
  storage: {
    local: {
      set: (items: object) => Promise<void>;
      clear: () => Promise<void>;
    };
  };
  tabs: { query: (q: { url?: string }) => Promise<Array<{ id?: number }>> };
};

// ─── service worker & extension id ───────────────────────────────────────────

export async function getServiceWorker(
  context: BrowserContext
): Promise<Worker> {
  const existing = context.serviceWorkers()[0];
  if (existing) return existing;
  return context.waitForEvent("serviceworker");
}

export async function getExtensionId(context: BrowserContext): Promise<string> {
  const sw = await getServiceWorker(context);
  return new URL(sw.url()).host;
}

export async function openPopup(context: BrowserContext): Promise<Page> {
  const id = await getExtensionId(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/popup.html`);
  return page;
}

// ─── JWT helper ──────────────────────────────────────────────────────────────

const HASURA_CLAIM = "https://hasura.io/jwt/claims";

/**
 * Build a fresh non-expired JWT carrying hasura claims. The extension only
 * decodes the payload (it doesn't verify signatures), so this token is
 * good enough for the token provider and the api-key bearer cache.
 */
export function makeJwt(claims: {
  workspaceId?: string;
  email?: string;
  ttlSeconds?: number;
}): string {
  const exp = Math.floor(Date.now() / 1000) + (claims.ttlSeconds ?? 3600);
  const payload = {
    exp,
    [HASURA_CLAIM]: {
      "x-hasura-workspace-id": claims.workspaceId ?? "ws-e2e",
      "x-hasura-email": claims.email ?? "e2e@example.com",
    },
  };
  // btoa is available in the Node test runtime.
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

// ─── chrome.storage seeds ────────────────────────────────────────────────────

/** Seed `auth.token` + `auth.method = token` so the popup boots signed in. */
export async function seedTokenAuth(
  context: BrowserContext,
  token: string
): Promise<void> {
  const sw = await getServiceWorker(context);
  await sw.evaluate(async (jwt) => {
    await chrome.storage.local.set({
      "auth.token": jwt,
      "auth.method": "token",
    });
  }, token);
}

export async function clearAuthStorage(context: BrowserContext): Promise<void> {
  const sw = await getServiceWorker(context);
  await sw.evaluate(async () => {
    await chrome.storage.local.clear();
  });
}

// ─── SW fetch stub ───────────────────────────────────────────────────────────

export interface ScriptedResponse {
  status?: number;
  body?: unknown;
}

export interface FetchRoute {
  urlIncludes: string;
  /** Static response, or a function that returns one per request. */
  response: ScriptedResponse | ((init?: RequestInit) => ScriptedResponse);
}

/**
 * Replace `fetch` in the service worker with a scripted shim. The shim
 * matches by substring on the URL and returns the first match; anything
 * unmatched falls through to the real fetch (so untouched endpoints behave
 * normally).
 *
 * Why not Playwright's `context.route`: in MV3 the BG runs in a service
 * worker; route interception of SW-initiated fetches is unreliable across
 * Playwright versions. Replacing fetch in the SW context is portable.
 */
export async function installSwFetchStub(
  context: BrowserContext,
  routes: FetchRoute[]
): Promise<void> {
  const sw = await getServiceWorker(context);
  await sw.evaluate(
    async (serializedRoutes) => {
      type Route = {
        urlIncludes: string;
        response: { status?: number; body?: unknown };
      };
      const realFetch = globalThis.fetch.bind(globalThis);
      const matchers = serializedRoutes as Route[];

      globalThis.fetch = (async (
        input: RequestInfo | URL,
        init?: RequestInit
      ) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
            ? input.toString()
            : input.url;
        const match = matchers.find((m) => url.includes(m.urlIncludes));
        if (!match) return realFetch(input, init);
        const status = match.response.status ?? 200;
        return new Response(
          match.response.body === undefined
            ? null
            : JSON.stringify(match.response.body),
          {
            status,
            headers: { "Content-Type": "application/json" },
          }
        );
      }) as typeof fetch;
    },
    routes.map((r) => ({
      urlIncludes: r.urlIncludes,
      response: typeof r.response === "function" ? r.response() : r.response,
    }))
  );
}

// ─── popup convenience ───────────────────────────────────────────────────────

/**
 * True when the popup's mode cards are present and enabled (the signed-in
 * "new selector" screen). Signed-out renders the auth panel instead, so the
 * cards are absent — which we report as "not enabled".
 */
export async function modesEnabled(popup: Page): Promise<boolean> {
  const single = popup.getByRole("button", { name: /single element/i });
  const list = popup.getByRole("button", { name: /list of items/i });
  if ((await single.count()) === 0 || (await list.count()) === 0) return false;
  return (await single.isEnabled()) && (await list.isEnabled());
}

// ─── picker driver (e2e-only) ────────────────────────────────────────────────

export async function startPickerSessionForTab(
  context: BrowserContext,
  args: { tabId: number; mode: "single" | "list"; url: string; title?: string }
): Promise<string> {
  const sw = await getServiceWorker(context);
  return sw.evaluate(async ({ tabId, mode, url, title }) => {
    const bridge = (
      globalThis as unknown as {
        __intunedE2E: {
          handlers: Record<
            string,
            (data: unknown, ctx: unknown) => Promise<unknown>
          >;
          context: object;
        };
      }
    ).__intunedE2E;
    if (!bridge)
      throw new Error("e2e bridge not present — build with --mode e2e");
    const handler = bridge.handlers["bg:startPickerSession"];
    if (!handler) {
      throw new Error(
        `e2e bridge missing handler. Have: ${Object.keys(bridge.handlers).join(
          ", "
        )}`
      );
    }
    const origin = new URL(url).origin;
    const result = (await handler(
      {
        mode,
        page: {
          url,
          origin,
          title,
          capturedAt: new Date().toISOString(),
        },
      },
      { ...bridge.context, sender: { tab: { id: tabId } } }
    )) as { sessionId: string };
    return result.sessionId;
  }, args);
}

/** Open the fixture sample page in a new tab and return both. */
export async function openSamplePage(
  context: BrowserContext
): Promise<{ page: Page; tabId: number; url: string }> {
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fileUrl = `file://${path.resolve(here, "pages/sample.html")}`;
  const page = await context.newPage();
  await page.goto(fileUrl);

  // Resolve the tab id from the SW side — it's the only place we can read
  // the chrome.tabs id of an arbitrary page object.
  const sw = await getServiceWorker(context);
  const tabId = (await sw.evaluate(async (matchUrl) => {
    const tabs = await chrome.tabs.query({ url: matchUrl });
    return tabs[0]?.id;
  }, fileUrl)) as number;

  return { page, tabId, url: fileUrl };
}
