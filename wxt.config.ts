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
      // Lets the background service worker call the local selector-ranking backend
      // cross-origin. Replace with the deployed API host before shipping (and gate
      // behind workspace auth + usage metering — deploy blocker).
      host_permissions: ["http://localhost:3000/*", "https://dev.intuned.io/*"],
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
});
