/**
 * Identity + location of the picker content script. Its entrypoint uses
 * `registration: "runtime"` (see `entrypoints/content.ts`), so WXT builds the
 * bundle to `content-scripts/content.js` and grants `<all_urls>` host access,
 * but deliberately does NOT declare it in the manifest — the background owns
 * injection. The leading slash anchors the path to the extension root (the
 * scripting API resolves file paths relative to it).
 */
const CONTENT_SCRIPT_ID = "selector-forge-picker";
const CONTENT_SCRIPT_MATCHES = ["<all_urls>"];
const CONTENT_SCRIPT_FILE = "/content-scripts/content.js";

/**
 * URL schemes the picker can be injected into. Others (chrome://, about:, the
 * Web Store) reject `executeScript`, and the content script's `<all_urls>` match
 * wouldn't cover them anyway — so we skip them during the open-tab sweep.
 */
const INJECTABLE_PROTOCOLS = new Set(["http:", "https:", "file:"]);

/**
 * Register the picker so pages the user browses to run it automatically, the
 * way a manifest-declared content script would. This is what keeps the
 * right-click context-menu tracker armed before the menu opens (see
 * `ContextMenuTracker`, which must observe the `contextmenu` event as it
 * happens). Call once at background startup.
 *
 * Registrations persist across service-worker restarts, so we skip if ours is
 * already present; an extension update clears them and this re-registers.
 */
export async function registerPickerContentScript(): Promise<void> {
  const existing = await browser.scripting.getRegisteredContentScripts({
    ids: [CONTENT_SCRIPT_ID],
  });
  if (existing.length > 0) return;

  await browser.scripting.registerContentScripts([
    {
      id: CONTENT_SCRIPT_ID,
      matches: CONTENT_SCRIPT_MATCHES,
      js: [CONTENT_SCRIPT_FILE],
      runAt: "document_idle",
    },
  ]);
}

/**
 * Guarantee the picker is live in `tabId` before the background messages it.
 * Registration only injects into pages loaded after it, so a tab that has been
 * open since before the extension was installed has no content script until we
 * put one there — the reason the picker used to require a page reload to work.
 *
 * Injecting is idempotent: the content script's `main()` guards against a second
 * run (see `entrypoints/content.ts`), so re-injecting an already-live tab is a
 * harmless no-op. Requires the `scripting` permission plus host access, both
 * covered by `registration: "runtime"`'s `<all_urls>` grant.
 */
export async function ensureInjectedContentScript(tabId: number): Promise<void> {
  await browser.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_SCRIPT_FILE],
  });
}

/**
 * Inject the picker into tabs that are already open. Registration only reaches
 * pages loaded *after* it, so a tab that was open before the extension was
 * installed/updated has no content script — its context-menu tracker is never
 * armed, so the right-click flow silently misses until the page is reloaded.
 * Sweeping the open tabs on install/update fixes that without a reload.
 *
 * Best-effort per tab: restricted/discarded tabs (and any that navigate away
 * mid-sweep) are skipped — they pick the content script up from registration on
 * their next load. One tab failing never blocks the others.
 */
export async function injectIntoOpenTabs(): Promise<void> {
  const tabs = await browser.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id == null) return;
      let protocol: string;
      try {
        protocol = new URL(tab.url ?? "").protocol;
      } catch {
        return; // no/opaque URL (loading, discarded, or restricted tab)
      }
      if (!INJECTABLE_PROTOCOLS.has(protocol)) return;
      try {
        await ensureInjectedContentScript(tab.id);
      } catch (error) {
        // Usually benign: a restricted page or a tab that navigated under us,
        // which registration covers on the tab's next load. Logged rather than
        // swallowed so a *systemic* failure — a wrong bundle path, a revoked
        // host grant — is visible instead of silently leaving the picker
        // un-injected on every pre-existing tab.
        console.warn(
          "[selector-extension] picker injection skipped for open tab",
          { tabId: tab.id, url: tab.url, error }
        );
      }
    })
  );
}
