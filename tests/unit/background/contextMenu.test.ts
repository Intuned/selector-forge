import { fakeBrowser } from "@webext-core/fake-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTEXT_MENU_ITEMS,
  handleContextMenuClick,
} from "../../../lib/background/contextMenu";
import { ContentMessageType } from "../../../lib/messaging";
import { createHarness, makeInflightSession } from "./harness";

// `handleContextMenuClick` is exported precisely so the seed → forward → cleanup
// contract can be unit-tested without a native menu. The e2e suite proves the
// pipeline end-to-end once; these tests pin the per-branch state transitions
// (especially the guarded teardown) that e2e can't observe.

type Info = Parameters<typeof handleContextMenuClick>[1];
type Tab = Parameters<typeof handleContextMenuClick>[2];

const SINGLE = "selector-forge:single";

function info(partial: Record<string, unknown> = {}): Info {
  return {
    menuItemId: SINGLE,
    pageUrl: "https://example.com/",
    frameId: 0,
    ...partial,
  } as Info;
}

function tab(partial: Record<string, unknown> = {}): Tab {
  return {
    id: 7,
    url: "https://example.com/",
    title: "Example",
    ...partial,
  } as Tab;
}

// The handler awaits `state.ready`; hydrate() resolves it (empty store after reset).
async function readyHarness(): Promise<ReturnType<typeof createHarness>> {
  const h = createHarness();
  await h.state.hydrate();
  return h;
}

describe("handleContextMenuClick", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("seeds the session and forwards the item to the clicked frame; BG does not run the loop", async () => {
    const h = await readyHarness();
    h.messaging.whenContent(ContentMessageType.ProcessContextMenuItem, () => ({
      ok: true,
    }));

    await handleContextMenuClick(h.context, info(), tab());

    const session = h.state.get();
    expect(session).toMatchObject({
      status: "picking",
      mode: "single",
      targets: [],
      page: { url: "https://example.com/", origin: "https://example.com" },
    });
    expect(h.state.getMeta()).toEqual({ tabId: 7 });

    // Exactly one content message — the item forward. The agent loop is started
    // by the content script via StartAgent, not by BG here.
    expect(h.messaging.contentCalls).toHaveLength(1);
    expect(h.messaging.contentCalls[0]).toMatchObject({
      tabId: 7,
      type: ContentMessageType.ProcessContextMenuItem,
      data: { sessionId: session!.sessionId, item: CONTEXT_MENU_ITEMS[0] },
    });
    expect(h.agentLoop.cancelCalls).toBe(1); // pre-seed cancel only
    expect(h.agentLoop.runCalls).toEqual([]);
  });

  it("ignores menu ids that aren't ours", async () => {
    const h = await readyHarness();

    await handleContextMenuClick(h.context, info({ menuItemId: "not-ours" }), tab());

    expect(h.state.get()).toBeNull();
    expect(h.messaging.contentCalls).toEqual([]);
    expect(h.agentLoop.cancelCalls).toBe(0);
  });

  it("does nothing when the click has no usable tab/page", async () => {
    const h = await readyHarness();

    // No pageUrl and a tab with no url -> no PageContext -> no seed.
    await handleContextMenuClick(
      h.context,
      info({ pageUrl: undefined }),
      tab({ url: undefined })
    );

    expect(h.state.get()).toBeNull();
    expect(h.messaging.contentCalls).toEqual([]);
    expect(h.agentLoop.cancelCalls).toBe(0);
  });

  it("clears the seeded session and deactivates the frame when the content side reports failure", async () => {
    const h = await readyHarness();
    h.messaging.whenContent(ContentMessageType.ProcessContextMenuItem, () => ({
      ok: false,
      reason: "No right-clicked element to use.",
    }));

    await handleContextMenuClick(h.context, info(), tab());

    expect(h.state.get()).toBeNull();
    expect(h.agentLoop.cancelCalls).toBe(2); // pre-seed + cleanup
    // The clicked frame is told to drop any overlay it may have mounted, so a
    // failure can't leave the "Generating…" overlay hung.
    expect(
      h.messaging.contentCalls.some(
        (c) => c.type === ContentMessageType.DeactivatePicker
      )
    ).toBe(true);
  });

  it("tears the session down when the forward send rejects (subframe with no receiver)", async () => {
    const h = await readyHarness();
    h.messaging.rejectContent(
      ContentMessageType.ProcessContextMenuItem,
      new Error("no matching message handler")
    );

    await handleContextMenuClick(h.context, info({ frameId: 99999 }), tab());

    expect(h.state.get()).toBeNull();
    expect(h.agentLoop.cancelCalls).toBe(2);
  });

  it("does NOT clear a newer session seeded during the awaited forward", async () => {
    const h = await readyHarness();
    // While our forward is in flight, a newer session takes over the singleton
    // (a second right-click, or a popup start). The failure path must leave it
    // alone rather than clobber it — this is the guarded-teardown invariant.
    h.messaging.whenContent(ContentMessageType.ProcessContextMenuItem, () => {
      h.state.set(makeInflightSession({ sessionId: "newer" }));
      return { ok: false, reason: "stale" };
    });

    await handleContextMenuClick(h.context, info(), tab());

    expect(h.state.get()?.sessionId).toBe("newer");
    expect(h.agentLoop.cancelCalls).toBe(1); // cleanup-cancel was skipped
  });
});
