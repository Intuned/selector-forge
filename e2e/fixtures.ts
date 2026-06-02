import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, chromium, type BrowserContext } from "@playwright/test";

// Extension E2E fixture. Loads the `.output/chrome-mv3-e2e` build via launchPersistentContext
// — extensions require a persistent context (incognito won't load them). Tests get a
// `context` fixture they can `.newPage()` from, and the popup is reachable via
// `chrome-extension://<id>/popup.html` (the id is logged when the service worker boots).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, "../.output/chrome-mv3-e2e");

export const test = base.extend<{ context: BrowserContext }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
    await use(context);
    await context.close();
  },
});

export { expect } from "@playwright/test";
