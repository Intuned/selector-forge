import type { Browser } from "wxt/browser";
import type { BackgroundMessageType } from "@/lib/messaging";
import type { BackgroundHandler } from "@/lib/background";
import type { PageContext } from "@/lib/state";
import { seedAndActivateSession } from "./startSessionCore";

type Tab = Browser.tabs.Tab;

const SUPPORTED_PROTOCOLS = new Set(["http:", "https:", "file:"]);

/**
 * Programmatic session start for the CDP bridge: no popup sender, no activeTab
 * gesture. The target tab is resolved explicitly and the page context is
 * derived from the tab itself (requires the `tabs` permission).
 */
export const handleStartPickerSessionForTab: BackgroundHandler<
  BackgroundMessageType.StartPickerSessionForTab
> = async ({ mode, tabId, urlContains }, ctx) => {
  const tab = await resolveTab(tabId, urlContains);
  if (tab.id == null) {
    throw new Error("Resolved tab has no id");
  }
  if (!tab.url) {
    throw new Error(
      "Cannot read the tab URL — is the `tabs` permission granted?"
    );
  }
  if (!SUPPORTED_PROTOCOLS.has(new URL(tab.url).protocol)) {
    throw new Error(
      `Cannot run the selector picker on ${tab.url} — only http(s) and file pages are supported`
    );
  }

  const page: PageContext = {
    url: tab.url,
    origin: new URL(tab.url).origin,
    title: tab.title,
    capturedAt: new Date().toISOString(),
  };

  const { sessionId } = await seedAndActivateSession(
    { mode, page, tabId: tab.id },
    ctx
  );
  return { sessionId, tabId: tab.id, page };
};

async function resolveTab(
  tabId: number | undefined,
  urlContains: string | undefined
): Promise<Tab> {
  if (tabId != null) {
    return browser.tabs.get(tabId);
  }

  if (urlContains) {
    const needle = urlContains.toLowerCase();
    const matches = (await browser.tabs.query({})).filter((tab) =>
      tab.url?.toLowerCase().includes(needle)
    );
    if (matches.length === 0) {
      throw new Error(`No open tab matches "${urlContains}"`);
    }
    if (matches.length > 1) {
      throw new Error(
        `Multiple tabs match "${urlContains}": ${matches
          .map((tab) => tab.url)
          .join(", ")} — use a more specific filter`
      );
    }
    return matches[0];
  }

  // `lastFocusedWindow` rather than `currentWindow`: there is no current
  // window from a service worker invoked over CDP.
  const [focusedActive] = await browser.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (focusedActive) return focusedActive;

  const activeTabs = await browser.tabs.query({ active: true });
  if (activeTabs.length === 1) return activeTabs[0];
  if (activeTabs.length > 1) {
    throw new Error(
      `Multiple windows are open with no focused window; cannot pick a tab ` +
        `unambiguously. Specify the target with --tab <url-substring>.`
    );
  }
  throw new Error("No active tab found to start a selector session in");
}
