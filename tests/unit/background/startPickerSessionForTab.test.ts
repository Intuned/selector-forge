import { fakeBrowser } from "@webext-core/fake-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleGetSessionState } from "../../../lib/background/handlers/getSessionState";
import { handleStartPickerSessionForTab } from "../../../lib/background/handlers/startPickerSessionForTab";
import { ContentMessageType } from "../../../lib/messaging";
import { createHarness, makeInflightSession } from "./harness";

type Tab = Awaited<ReturnType<typeof fakeBrowser.tabs.query>>[number];

function tab(partial: Partial<Tab>): Tab {
  return partial as Tab;
}

describe("handleStartPickerSessionForTab", () => {
  beforeEach(() => fakeBrowser.reset());

  it("targets an explicit tabId and derives page context from the tab", async () => {
    vi.spyOn(fakeBrowser.tabs, "get").mockResolvedValue(
      tab({ id: 7, url: "https://example.com/items?p=2", title: "Items" })
    );
    const h = createHarness();

    const result = await handleStartPickerSessionForTab(
      { mode: "single", tabId: 7 },
      h.context
    );

    expect(result.tabId).toBe(7);
    expect(result.page).toMatchObject({
      url: "https://example.com/items?p=2",
      origin: "https://example.com",
      title: "Items",
    });
    expect(typeof result.page.capturedAt).toBe("string");
    expect(h.state.getMeta()).toEqual({ tabId: 7 });
    expect(h.state.get()).toMatchObject({
      sessionId: result.sessionId,
      status: "picking",
      mode: "single",
    });
    expect(h.messaging.contentCalls[0]).toMatchObject({
      tabId: 7,
      type: ContentMessageType.ActivatePicker,
    });
  });

  it("resolves a unique tab by case-insensitive URL substring", async () => {
    vi.spyOn(fakeBrowser.tabs, "query").mockResolvedValue([
      tab({ id: 1, url: "https://example.com/" }),
      tab({ id: 2, url: "https://app.Intuned.io/projects" }),
    ]);
    const h = createHarness();

    const result = await handleStartPickerSessionForTab(
      { mode: "list", urlContains: "intuned.io" },
      h.context
    );

    expect(result.tabId).toBe(2);
    expect(fakeBrowser.tabs.query).toHaveBeenCalledWith({});
  });

  it("throws listing matches when the URL filter is ambiguous", async () => {
    vi.spyOn(fakeBrowser.tabs, "query").mockResolvedValue([
      tab({ id: 1, url: "https://example.com/a" }),
      tab({ id: 2, url: "https://example.com/b" }),
    ]);
    const h = createHarness();

    await expect(
      handleStartPickerSessionForTab({ mode: "single", urlContains: "example" }, h.context)
    ).rejects.toThrow(/multiple tabs match.*example\.com\/a.*example\.com\/b/is);
    expect(h.state.get()).toBeNull();
  });

  it("throws when no tab matches the URL filter", async () => {
    vi.spyOn(fakeBrowser.tabs, "query").mockResolvedValue([
      tab({ id: 1, url: "https://example.com/" }),
    ]);
    const h = createHarness();

    await expect(
      handleStartPickerSessionForTab({ mode: "single", urlContains: "intuned" }, h.context)
    ).rejects.toThrow(/no open tab matches/i);
  });

  it("falls back to the active tab of the last focused window", async () => {
    const querySpy = vi
      .spyOn(fakeBrowser.tabs, "query")
      .mockResolvedValue([tab({ id: 9, url: "https://example.com/", title: "Ex" })]);
    const h = createHarness();

    const result = await handleStartPickerSessionForTab({ mode: "single" }, h.context);

    expect(result.tabId).toBe(9);
    expect(querySpy).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true });
  });

  it("refuses to guess when no window is focused and multiple are active", async () => {
    vi.spyOn(fakeBrowser.tabs, "query").mockImplementation(async (query) => {
      // No last-focused window; each open window reports its own active tab.
      if ((query as { lastFocusedWindow?: boolean }).lastFocusedWindow) return [];
      return [
        tab({ id: 1, url: "https://a.example/" }),
        tab({ id: 2, url: "https://b.example/" }),
      ];
    });
    const h = createHarness();

    await expect(
      handleStartPickerSessionForTab({ mode: "single" }, h.context)
    ).rejects.toThrow(/multiple windows.*--tab/is);
    expect(h.state.get()).toBeNull();
  });

  it("uses the sole active tab when no window is focused but only one is active", async () => {
    vi.spyOn(fakeBrowser.tabs, "query").mockImplementation(async (query) => {
      if ((query as { lastFocusedWindow?: boolean }).lastFocusedWindow) return [];
      return [tab({ id: 5, url: "https://only.example/", title: "Only" })];
    });
    const h = createHarness();

    const result = await handleStartPickerSessionForTab({ mode: "single" }, h.context);
    expect(result.tabId).toBe(5);
  });

  it("rejects restricted pages (non http/https/file URLs)", async () => {
    vi.spyOn(fakeBrowser.tabs, "get").mockResolvedValue(
      tab({ id: 3, url: "chrome://extensions" })
    );
    const h = createHarness();

    await expect(
      handleStartPickerSessionForTab({ mode: "single", tabId: 3 }, h.context)
    ).rejects.toThrow(/only http\(s\) and file pages/i);
  });

  it("clears the seeded session and throws when the picker cannot attach", async () => {
    vi.spyOn(fakeBrowser.tabs, "get").mockResolvedValue(
      tab({ id: 4, url: "https://example.com/", title: "Ex" })
    );
    const h = createHarness();
    h.messaging.whenContent(ContentMessageType.ActivatePicker, () => ({
      ok: false,
      reason: "no content script",
    }));

    await expect(
      handleStartPickerSessionForTab({ mode: "single", tabId: 4 }, h.context)
    ).rejects.toThrow(/could not attach to tab 4.*no content script/is);
    expect(h.state.get()).toBeNull();
  });
});

describe("handleGetSessionState", () => {
  it("returns the current session state, or null when none exists", () => {
    const h = createHarness();
    expect(handleGetSessionState(undefined as never, h.context)).toBeNull();

    const session = makeInflightSession();
    h.state.set(session);
    expect(handleGetSessionState(undefined as never, h.context)).toEqual(session);
  });
});
