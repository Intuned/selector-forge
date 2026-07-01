import { fakeBrowser } from "@webext-core/fake-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  injectIntoOpenTabs,
  registerPickerContentScript,
} from "../../../lib/background/ensureContentScript";

type Tab = Awaited<ReturnType<typeof fakeBrowser.tabs.query>>[number];

function tab(partial: Partial<Tab>): Tab {
  return partial as Tab;
}

const CONTENT_SCRIPT_FILE = "/content-scripts/content.js";

describe("injectIntoOpenTabs", () => {
  beforeEach(() => fakeBrowser.reset());
  afterEach(() => vi.restoreAllMocks());

  it("injects into every http/https/file tab, skipping restricted and url-less tabs", async () => {
    vi.spyOn(fakeBrowser.tabs, "query").mockResolvedValue([
      tab({ id: 1, url: "https://example.com/" }),
      tab({ id: 2, url: "chrome://extensions" }),
      tab({ id: 3, url: "file:///Users/x/page.html" }),
      tab({ id: 4 }), // discarded/loading tab, no url
      tab({ id: 5, url: "http://localhost:3000/" }),
    ]);
    const executeScript = vi
      .spyOn(fakeBrowser.scripting, "executeScript")
      .mockResolvedValue([]);

    await injectIntoOpenTabs();

    const injectedTabIds = executeScript.mock.calls.map(
      ([injection]) => injection.target.tabId
    );
    expect(injectedTabIds.sort()).toEqual([1, 3, 5]);
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 1 },
      files: [CONTENT_SCRIPT_FILE],
    });
  });

  it("keeps sweeping when one tab's injection fails (restricted page mid-sweep)", async () => {
    vi.spyOn(fakeBrowser.tabs, "query").mockResolvedValue([
      tab({ id: 1, url: "https://a.example/" }),
      tab({ id: 2, url: "https://b.example/" }),
    ]);
    const executeScript = vi
      .spyOn(fakeBrowser.scripting, "executeScript")
      .mockImplementation(async ({ target }) => {
        if (target.tabId === 1) throw new Error("Cannot access contents");
        return [];
      });

    // The rejection is swallowed; the call resolves and tab 2 still gets injected.
    await expect(injectIntoOpenTabs()).resolves.toBeUndefined();
    expect(executeScript).toHaveBeenCalledTimes(2);
  });
});

describe("registerPickerContentScript", () => {
  beforeEach(() => fakeBrowser.reset());
  afterEach(() => vi.restoreAllMocks());

  it("registers the content script for future page loads when none is registered yet", async () => {
    vi.spyOn(
      fakeBrowser.scripting,
      "getRegisteredContentScripts"
    ).mockResolvedValue([]);
    const register = vi
      .spyOn(fakeBrowser.scripting, "registerContentScripts")
      .mockResolvedValue(undefined);

    await registerPickerContentScript();

    expect(register).toHaveBeenCalledWith([
      {
        id: "selector-forge-picker",
        matches: ["<all_urls>"],
        js: [CONTENT_SCRIPT_FILE],
        runAt: "document_idle",
      },
    ]);
  });

  it("is idempotent: skips registration when ours already survived a worker restart", async () => {
    vi.spyOn(
      fakeBrowser.scripting,
      "getRegisteredContentScripts"
    ).mockResolvedValue([{ id: "selector-forge-picker" } as never]);
    const register = vi.spyOn(fakeBrowser.scripting, "registerContentScripts");

    await registerPickerContentScript();

    expect(register).not.toHaveBeenCalled();
  });
});
