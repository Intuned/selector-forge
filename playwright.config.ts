import { defineConfig } from "@playwright/test";

// E2E runs against the packaged extension built by `wxt build --mode e2e`.
// The fixture in e2e/fixtures.ts loads `.output/chrome-mv3-e2e` as an unpacked extension
// via launchPersistentContext (extensions require a persistent context).
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    trace: "retain-on-failure",
  },
});
