import { test, expect } from "./fixtures";
import {
  clearAuthStorage,
  getServiceWorker,
  makeJwt,
  modesEnabled,
  openPopup,
  openSamplePage,
  seedTokenAuth,
  startPickerSessionForTab,
} from "./helpers";

async function stubAgentBackend(
  context: Parameters<typeof getServiceWorker>[0],
  bestSelector: { type: "css" | "xpath"; value: string }
): Promise<void> {
  const sw = await getServiceWorker(context);
  await sw.evaluate((sel) => {
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
  }, bestSelector);
}

test.describe("with seeded auth", () => {
  test.beforeEach(async ({ context }) => {
    await clearAuthStorage(context);
    await seedTokenAuth(
      context,
      makeJwt({ workspaceId: "ws-e2e", email: "e2e@example.com" })
    );
  });

  test("popup bootstraps signed-in: identity shown, modes enabled", async ({
    context,
  }) => {
    const popup = await openPopup(context);

    await expect(popup.locator("#auth-state")).toHaveAttribute(
      "data-state",
      "authenticated"
    );
    await expect(popup.getByText("e2e@example.com")).toBeVisible();
    expect(await modesEnabled(popup)).toBe(true);
  });

  test("single-pick happy path: clicking a page element produces a selector in the popup", async ({
    context,
  }) => {
    const { page, tabId } = await openSamplePage(context);
    await stubAgentBackend(context, { type: "css", value: "#primary" });

    // Drive the picker against the fixture tab.
    const sessionId = await startPickerSessionForTab(context, {
      tabId,
      mode: "single",
      url: page.url(),
      title: "sample",
    });
    expect(sessionId).toBeTruthy();

    // The overlay appears in the page.
    await expect(page.locator("[data-intuned-picker]")).toBeAttached();

    // User clicks the primary button. Click via the page DOM (overlay
    // intercepts in capture phase — the click won't fire the button's own
    // handler, which is the contract we want).
    await page.locator("#primary").click();

    // The popup, opened now, should render the selector returned by the
    // (stubbed) backend. Successful results land in history; the most recent
    // entry is auto-expanded, surfacing the selector in its `.result-code` box.
    const popup = await openPopup(context);
    await expect(popup.locator(".result-code")).toHaveText("#primary");

    // Overlay is gone (deactivated as part of settle).
    await expect(page.locator("[data-intuned-picker]")).toHaveCount(0);
  });

  test("list-pick + Done: picking multiple rows produces the bestSelector for that set", async ({
    context,
  }) => {
    const { page, tabId } = await openSamplePage(context);
    await stubAgentBackend(context, { type: "css", value: "#people .item" });

    await startPickerSessionForTab(context, {
      tabId,
      mode: "list",
      url: page.url(),
      title: "sample",
    });
    await expect(page.locator("[data-intuned-picker]")).toBeAttached();

    // Pick the three list items; commit with Enter (Done's keyboard shortcut).
    await page.locator('li[data-id="1"]').click();
    await page.locator('li[data-id="2"]').click();
    await page.locator('li[data-id="3"]').click();
    await page.keyboard.press("Enter");

    const popup = await openPopup(context);
    await expect(popup.locator(".result-code")).toHaveText("#people .item");
  });

  test("Esc cancels the in-flight session: overlay removed, popup status returns to neutral", async ({
    context,
  }) => {
    const { page, tabId } = await openSamplePage(context);

    // No backend stub needed — Esc terminates before any agent fetch.
    await startPickerSessionForTab(context, {
      tabId,
      mode: "single",
      url: page.url(),
      title: "sample",
    });
    await expect(page.locator("[data-intuned-picker]")).toBeAttached();

    await page.keyboard.press("Escape");

    await expect(page.locator("[data-intuned-picker]")).toHaveCount(0);

    const popup = await openPopup(context);
    // Mode buttons are enabled (still signed in) and no result is rendered.
    expect(await modesEnabled(popup)).toBe(true);
    await expect(popup.locator(".result-code")).toHaveCount(0);
  });

  test("sign-out wipes auth and disables the mode buttons", async ({
    context,
  }) => {
    const popup = await openPopup(context);
    expect(await modesEnabled(popup)).toBe(true);

    // Sign out now lives in the workspace-switcher menu in the header.
    await popup.locator("#workspace-menu").click();
    await popup.locator("#sign-out").click();

    // The component re-renders inline once SignOut resolves.
    await expect(popup.locator("#auth-state")).not.toHaveAttribute(
      "data-state",
      "authenticated"
    );
    expect(await modesEnabled(popup)).toBe(false);
  });
});
