import { defineConfig } from "wxt";

// Pins the Chrome extension ID to `kagnpahelafjcmmbbcinolcjldclchnc` for
// unpacked/--load-extension installs, so external tooling can find the
// background worker by URL prefix. Chrome derives the ID from a hash of this
// RSA public key, so the value must be the key itself — it cannot be a
// friendly name. Keep in sync with SELECTOR_EXTENSION_ID in
// apps/intuned-cli/src/lib/browser/extensionTransport/constants.ts.
// Public key only; the private key (needed solely for .crx packing) lives
// in 1Password ("selector-extension signing key").
const intunedSelectorKey =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqlaqz8lsLEWGz3ETXFvNS82pmHsnDu/FZ7M+17Owi+Vt/QUkEv8REeQkOm4PiHqZHmyHsPXjAdADCJBWdXFAWWh9hIBxCxcczN/kkrvIY6GSFausVrG5thvmRhU4l74FbLBwX0qfHJ9UXfkmxDbjVL+lDQACZfmgpJpuHTw/P8QYR9lHc9CVpi5bYrwTozKwN4qNhGQCuMA148bKNXIa7ldt7pQ8xHdwziD9Q4ZIFOESjdFkHn/VlFR/7gtd2ZddTBOmIGw5r+no6u+FDQ61FXQ47yyyYP2DBSU+wTgho62C1AGQd5VE3f+2YYvxET62Bv5JqZV6M/sJgZ6g6hrFAwIDAQAB";

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
      // `tabs` is required for the CLI bridge: a CDP-initiated session start has no
      // user gesture (so no activeTab grant), and the background must read tab
      // url/title to derive page context and match --tab URL filters.
      permissions: ["storage", "activeTab", "tabs"],
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
    } else {
      manifest.key = intunedSelectorKey;
    }

    return manifest;
  },
  dev: {
    server: {
      port: 7877,
    },
  },
});
