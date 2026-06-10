import { fakeBrowser } from "@webext-core/fake-browser";

// Pretend we're inside a browser extension so `webextension-polyfill`'s
// startup guard accepts us. The polyfill only checks for the presence of
// `chrome.runtime.id`; once past that, we route everything through
// fakeBrowser anyway. Must be set before any import that pulls the polyfill
// (e.g. `@webext-core/messaging` via `lib/messaging`).
(
  globalThis as unknown as {
    chrome: { runtime: { id: string } };
  }
).chrome = { runtime: { id: "test-extension-id" } };

// Install the in-memory webextension polyfill as the global `browser`.
// We avoid WxtVitest (it drags WXT's bundled Vite/rolldown that clashes
// with Vitest 3).
(globalThis as unknown as { browser: typeof fakeBrowser }).browser =
  fakeBrowser;
