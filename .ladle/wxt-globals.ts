// Make the popup's extension globals safe to evaluate under Ladle (a plain Vite
// app, not a browser extension). Two consumers need them:
//
//  1. Popup handlers call the WXT-injected global `browser` (e.g.
//     `browser.tabs.create`) on click — undefined in Ladle → ReferenceError.
//  2. `@webext-core/messaging` (imported via the popup's messaging layer) pulls
//     in `webextension-polyfill`, which THROWS at import unless
//     `globalThis.chrome.runtime.id` exists:
//       if (!(globalThis.chrome?.runtime?.id))
//         throw new Error("This script should only be loaded in a browser extension.");
//     and, when `globalThis.browser.runtime.id` is also set, the polyfill skips
//     its chrome-wrapping and just re-exports our `browser` stub (see the tail
//     of browser-polyfill.js).
//
// Imported FIRST by `.ladle/components.tsx` — part of the Ladle app shell, which
// evaluates before any lazily-loaded story chunk — so these globals exist
// before a story (or its messaging import) is ever evaluated.

const noop = () => {};

const stub = {
  tabs: {
    create: async () => ({}),
    query: async () => [] as unknown[],
  },
  runtime: {
    id: "ladle-stub",
    sendMessage: async () => undefined,
    onMessage: {
      addListener: noop,
      removeListener: noop,
      hasListener: () => false,
    },
  },
  storage: {
    local: { get: async () => ({}), set: async () => {}, remove: async () => {} },
    session: { get: async () => ({}), set: async () => {}, remove: async () => {} },
  },
};

const g = globalThis as Record<string, any>;

// `window.browser` is undefined on Chromium, so a plain assign installs our stub
// (and gives the polyfill a valid `browser.runtime.id` to re-export).
g.browser ??= stub;

// `window.chrome` ALREADY EXISTS on Chromium pages but has no `runtime`, so we
// must AUGMENT it — `chrome ??= stub` would leave the real object in place and
// the polyfill's `chrome.runtime.id` guard would still fail. This single line
// is what stops the "should only be loaded in a browser extension" throw.
g.chrome ??= {};
g.chrome.runtime ??= {};
g.chrome.runtime.id ??= "ladle-stub";
