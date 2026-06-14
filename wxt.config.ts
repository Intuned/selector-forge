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
      // Least privilege: activeTab is granted on the popup gesture. The picker is a
      // statically declared content script (see `entrypoints/content.ts`) the background
      // drives via message passing, so no `scripting` permission is needed.
      permissions: ["storage", "activeTab"],
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
