import { test, expect } from "./fixtures";
import {
  clearAuthStorage,
  getServiceWorker,
  makeJwt,
  openPopup,
  openSamplePage,
  seedTokenAuth,
} from "./helpers";

// "selector-forge:single" below mirrors the single item id in
// lib/background/contextMenu.ts CONTEXT_MENU_ITEMS (kept in sync by hand — the
// e2e ts project doesn't resolve the `@/` alias, and evaluate() closures can't
// capture outer vars).

/**
 * Stub /api/selectors/create to settle with a fixed selector. `delayMs` holds
 * the response open so the in-page "Generating…" overlay is observable.
 */
async function stubAgentBackend(
  context: Parameters<typeof getServiceWorker>[0],
  bestSelector: { type: "css" | "xpath"; value: string },
  delayMs = 0
): Promise<void> {
  const sw = await getServiceWorker(context);
  await sw.evaluate(
    async ({ sel, delay }) => {
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
        if (url.includes("/api/selectors/create")) {
          if (delay > 0) await new Promise((r) => setTimeout(r, delay));
          const state = JSON.parse((init?.body as string) ?? "{}");
          return new Response(
            JSON.stringify({
              state: {
                ...state,
                status: "done",
                finalResult: { status: "ok", bestSelector: sel },
              },
              action: { type: "done" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(null, { status: 404 });
      }) as typeof fetch;
    },
    { sel: bestSelector, delay: delayMs }
  );
}

/** Invoke the context-menu click handler via the e2e bridge. */
async function clickContextMenu(
  context: Parameters<typeof getServiceWorker>[0],
  args: { tabId: number; url: string; title?: string; frameId?: number }
): Promise<void> {
  const sw = await getServiceWorker(context);
  await sw.evaluate(async ({ tabId, url, title, frameId }) => {
    const bridge = (
      globalThis as unknown as {
        __intunedE2E: {
          contextMenuClick: (info: unknown, tab: unknown) => Promise<void>;
        };
      }
    ).__intunedE2E;
    await bridge.contextMenuClick(
      { menuItemId: "selector-forge:single", pageUrl: url, frameId: frameId ?? 0 },
      { id: tabId, url, title }
    );
  }, { ...args, frameId: args.frameId ?? 0 });
}

// Proof-of-concept check: the `contextMenus` permission is actually granted and
// the API is usable inside the loaded extension's service worker — i.e. we CAN
// add custom items to the page right-click menu. Native OS menus aren't
// inspectable from Playwright, so this asserts the API contract (create with no
// runtime.lastError), which is what gates the menu items rendering at all.
test("contextMenus API is granted and create() works in the loaded extension", async ({
  context,
}) => {
  const sw = await getServiceWorker(context);

  const result = await sw.evaluate(async () => {
    const c = (globalThis as unknown as { chrome?: any }).chrome;
    const api = c?.contextMenus;
    if (!api) {
      return { ok: false, reason: "chrome.contextMenus undefined (no permission)" };
    }

    await new Promise<void>((resolve) => api.removeAll(() => resolve()));

    const probe = await new Promise<{ id: unknown; err?: string }>((resolve) => {
      const id = api.create(
        { id: "sf-e2e-probe", title: "probe", contexts: ["all"] },
        () => resolve({ id, err: c.runtime.lastError?.message })
      );
    });

    return { ok: !probe.err, id: probe.id, err: probe.err };
  });

  expect(result.reason ?? "").toBe("");
  expect(result.err ?? "").toBe("");
  expect(result.ok).toBe(true);
  expect(result.id).toBe("sf-e2e-probe");
});

// Guards the hand-synced `"selector-forge:single"` literal that clickContextMenu
// fires (see the header comment): the bridge exposes the real ids, so a rename in
// CONTEXT_MENU_ITEMS fails here loudly instead of silently making every
// click-driven test pass for the wrong reason (unmatched id → BG early-returns).
test("the clicked menu id matches the extension's source of truth", async ({
  context,
}) => {
  const sw = await getServiceWorker(context);
  const ids = await sw.evaluate(
    () =>
      (
        globalThis as unknown as {
          __intunedE2E: { contextMenuItemIds: string[] };
        }
      ).__intunedE2E.contextMenuItemIds
  );
  expect(ids).toContain("selector-forge:single");
});

test.describe("page right-click flow", () => {
  test.beforeEach(async ({ context }) => {
    await clearAuthStorage(context);
    await seedTokenAuth(
      context,
      makeJwt({ workspaceId: "ws-e2e", email: "e2e@example.com" })
    );
  });

  test("right-click an element + Generate selector → selector in the popup", async ({
    context,
  }) => {
    const { page, tabId, url } = await openSamplePage(context);
    await stubAgentBackend(context, { type: "css", value: "#primary" });

    // Right-click the element: the content script's capture listener records it
    // as the context target (no native menu needed to set this).
    await page.dispatchEvent("#primary", "contextmenu");

    // Fire the menu item — drives seed → adopt → StartAgent → agent loop.
    await clickContextMenu(context, { tabId, url, title: "sample" });

    // The settled selector lands in history; the auto-expanded latest entry
    // surfaces it in the popup's result box.
    const popup = await openPopup(context);
    await expect(popup.locator(".result-code")).toHaveText("#primary");

    // The generating overlay is torn down on settle.
    await expect(page.locator("[data-intuned-picker]")).toHaveCount(0);
  });

  test("generating overlay shows while the selector is built, then is torn down", async ({
    context,
  }) => {
    const { page, tabId, url } = await openSamplePage(context);
    // Hold the backend open so the in-flight overlay is observable.
    await stubAgentBackend(context, { type: "css", value: "#primary" }, 1500);

    await page.dispatchEvent("#primary", "contextmenu");
    await clickContextMenu(context, { tabId, url, title: "sample" });

    // Overlay is mounted in the generating state. (Playwright locators pierce
    // the overlay's open shadow root.)
    await expect(page.locator("[data-intuned-picker]")).toBeAttached();
    await expect(page.getByText(/Generating selector/)).toBeVisible();

    // Once the backend settles (~1.5s), the overlay is torn down. (The settled
    // result in the popup is covered by the happy-path test above.)
    await expect(page.locator("[data-intuned-picker]")).toHaveCount(0);
  });

  test("no element captured → session is torn down, no result", async ({
    context,
  }) => {
    const { page, tabId, url } = await openSamplePage(context);
    await stubAgentBackend(context, { type: "css", value: "#primary" });

    // Click the menu WITHOUT a preceding right-click: nothing to adopt.
    await clickContextMenu(context, { tabId, url, title: "sample" });

    // Adopt fails → BG clears state. The agent loop never runs, so the popup has
    // no result to show.
    const popup = await openPopup(context);
    await expect(popup.locator(".result-code")).toHaveCount(0);
    expect(await page.locator("[data-intuned-picker]").count()).toBe(0);
  });

  test("click from a frame with no content script fails safe (no stale target)", async ({
    context,
  }) => {
    const { page, tabId, url } = await openSamplePage(context);
    await stubAgentBackend(context, { type: "css", value: "#primary" });

    // Right-click an element in the top frame so a stale target exists there.
    await page.dispatchEvent("#primary", "contextmenu");

    // But the menu click reports a non-existent frame (as a subframe would).
    // The message routes there, finds no receiver, and the session is cleaned
    // up — we must NOT fall back to the top-frame target.
    await clickContextMenu(context, { tabId, url, title: "sample", frameId: 99999 });

    const popup = await openPopup(context);
    await expect(popup.locator(".result-code")).toHaveCount(0);
    expect(await page.locator("[data-intuned-picker]").count()).toBe(0);
  });
});
