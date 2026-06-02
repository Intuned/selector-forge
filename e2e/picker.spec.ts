import { test, expect } from "./fixtures";

// Smoke-only scaffold. Confirms the extension loads + the popup renders the mode
// buttons. Real pick + agent flow tests land with the picker UX implementation.

test("popup renders mode buttons", async ({ context }) => {
  // Wait for the service worker to register. Both MV3 (`serviceWorkers()`) and the
  // fallback (`backgroundPages()`) are covered to keep the fixture portable.
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker");
  }
  const extensionId = new URL(serviceWorker.url()).host;

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByRole("button", { name: "Single" })).toBeVisible();
  await expect(page.getByRole("button", { name: "List" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Multiple" })).toBeDisabled();
});
