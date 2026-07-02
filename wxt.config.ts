import { defineConfig } from "wxt";

// Chrome MV3 + Firefox MV3.
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifestVersion: 3,
  manifest: ({ browser, mode }) => {
    // `any` to attach fields ahead of WXT's manifest typings.
    const manifest: any = {
      name: "Selector Forge - AI selector builder",
      description:
        "Pick an element on the page and get a reliable AI-built selector for it. Powered by Intuned.",
      action: { default_title: "Pick element → reliable selector" },
      // The picker content script (see `entrypoints/content.ts`) uses
      // `registration: "runtime"`, so it is NOT in the manifest and its
      // `<all_urls>` match becomes a host permission. `scripting` lets the
      // background own that content script's lifecycle: `registerContentScripts`
      // for future page loads and `executeScript` to inject on demand into a tab
      // that predates the extension (so the user need not reload the page). See
      // `lib/background/ensureContentScript.ts`.
      // `contextMenus` adds the page right-click "Selector Forge" submenu
      // (currently one item, "Single element"); see `lib/background/contextMenu.ts`.
      // `tabs` is required for the CLI bridge: a CDP-initiated session start has no
      // user gesture (so no activeTab grant), and the background must read tab
      // url/title to derive page context and match --tab URL filters. `activeTab`
      // stays for the popup gesture.
      permissions: ["storage", "activeTab", "contextMenus", "tabs", "scripting"],
      // Lets the background service worker call the API host cross-origin. Prod
      // (`app.intuned.io`) is the default base URL; `dev.intuned.io` is kept so a
      // `config.apiBase` override (see `lib/config.ts`) can target it without a
      // manifest change.
      host_permissions: [
        "https://app.intuned.io/*",
        "https://metricsshop.hasura.app/v1/graphql",
      ],
    };

    // E2E-only build: grant host access so Playwright can inject without a user gesture.
    // NEVER ship this build.
    if (mode === "e2e") {
      manifest.host_permissions = ["<all_urls>"];
    }

    if (browser === "firefox") {
      manifest.browser_specific_settings = {
        gecko: {
          // TODO: confirm real org domain before AMO submit.
          id: "selector@intunedhq.com",
        },
      };
    }

    return manifest;
  },
  dev: {
    server: {
      port: 7877,
    },
  },
});
