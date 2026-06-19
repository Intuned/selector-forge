import tsconfigPaths from "vite-tsconfig-paths";

// Resolve the WXT path aliases (`@/`, `~/`, …) declared in `.wxt/tsconfig.json`
// so stories can import popup components the same way the app does.
//
// Note: the popup's `@webext-core/messaging` import is handled at runtime by the
// `chrome`/`browser` global stubs in `.ladle/wxt-globals.ts` (its polyfill only
// needs `chrome.runtime.id` to exist), not by aliasing the module — Vite's dep
// optimizer pre-bundles it before alias resolution, so an alias wouldn't apply.
export default {
  plugins: [tsconfigPaths()],
};
