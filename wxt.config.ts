import { defineConfig } from "wxt";

// Chrome MV3 + Firefox MV3.
export default defineConfig({
  manifestVersion: 3,
  manifest: ({ browser, mode }) => {
    // `any` to attach fields ahead of WXT's manifest typings.
    const manifest: any = {
      name: "Intuned Selector",
      description:
        "Pick an element on the page and get a reliable selector for it.",
      action: { default_title: "Pick element → reliable selector" },
      // Least privilege: activeTab is granted on the popup gesture; scripting lets the
      // background inject the picker on demand. No <all_urls> in the shipped build.
      permissions: ["storage", "activeTab", "scripting"],
      // Lets the background service worker call the API host cross-origin. Prod
      // (`app.intuned.io`) is the default base URL; `dev.intuned.io` and localhost
      // are kept so `config.apiBase` overrides (see `lib/config.ts`) can target them
      // without a manifest change. The localhost entry also covers the
      // selector-create endpoint until it moves behind `getApiBase()` + auth.
      host_permissions: [
        "https://app.intuned.io/*",
        "https://dev.intuned.io/*",
        "http://localhost:3000/*",
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
