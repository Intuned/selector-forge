import { fakeBrowser } from "@webext-core/fake-browser";

// Install the in-memory webextension polyfill as the global `browser` for unit tests.
// We avoid WxtVitest (it drags WXT's bundled Vite/rolldown that clashes with Vitest 3).
(globalThis as unknown as { browser: typeof fakeBrowser }).browser = fakeBrowser;
