import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PickerSession } from "../../lib/content/dom/pickerSession";

function dispatchClick(target: Element): void {
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true })
  );
}

function dispatchKey(key: string): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  );
}

describe("PickerSession", () => {
  let session: PickerSession;

  beforeEach(() => {
    document.body.innerHTML = `
      <ul>
        <li id="row-1" class="row">A</li>
        <li id="row-2" class="row">B</li>
        <li id="row-3" class="row">C</li>
      </ul>
    `;
    session = new PickerSession();
  });

  afterEach(async () => {
    await session.deactivatePicker();
    document
      .querySelectorAll("[data-intuned-picker], [data-intuned-picker-cursor]")
      .forEach((n) => n.remove());
    document.body.innerHTML = "";
  });

  describe("activatePicker → onSubmit", () => {
    it("single mode: a click produces one target with an element id, xpath, and an inspection view that includes the target", async () => {
      const onSubmit = vi.fn();
      await session.activatePicker(
        { mode: "single", status: "picking", targets: [] },
        { onSubmit, onCancel: vi.fn() }
      );

      dispatchClick(document.getElementById("row-1")!);

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const payload = onSubmit.mock.calls[0][0];
      expect(payload.targets).toEqual([
        expect.objectContaining({
          elementId: expect.stringMatching(/^el-\d+$/),
          elementXpath: expect.any(String),
        }),
      ]);
      // The inspection view sees the target via the stamped element_id.
      expect(payload.inspectionView).toContain(
        `element_id="${payload.targets[0].elementId}"`
      );
    });

    it("list mode: Enter commits multiple targets in pick order, each with a distinct id", async () => {
      const onSubmit = vi.fn();
      await session.activatePicker(
        { mode: "list", status: "picking", targets: [] },
        { onSubmit, onCancel: vi.fn() }
      );

      dispatchClick(document.getElementById("row-1")!);
      dispatchClick(document.getElementById("row-3")!);
      dispatchKey("Enter");

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const { targets } = onSubmit.mock.calls[0][0];
      expect(targets).toHaveLength(2);
      expect(
        new Set(targets.map((t: { elementId: string }) => t.elementId)).size
      ).toBe(2);
      // Ordering matches the click order — pick-order is the contract the
      // backend uses to align targets with selectors. The xpath algorithm
      // short-circuits on `id`, so picked rows resolve via their id.
      expect(targets[0].elementXpath).toBe('//*[@id="row-1"]');
      expect(targets[1].elementXpath).toBe('//*[@id="row-3"]');
    });

    it("Esc fires onCancel without onSubmit", async () => {
      const onSubmit = vi.fn();
      const onCancel = vi.fn();
      await session.activatePicker({ mode: "list", status: "picking", targets: [] }, { onSubmit, onCancel });

      dispatchKey("Escape");

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe("activatePicker twice replaces the first session", () => {
    it("a click in the second session reaches its callbacks, not the first's", async () => {
      const firstSubmit = vi.fn();
      const secondSubmit = vi.fn();

      await session.activatePicker(
        { mode: "single", status: "picking", targets: [] },
        { onSubmit: firstSubmit, onCancel: vi.fn() }
      );
      await session.activatePicker(
        { mode: "single", status: "picking", targets: [] },
        { onSubmit: secondSubmit, onCancel: vi.fn() }
      );

      dispatchClick(document.getElementById("row-1")!);

      expect(firstSubmit).not.toHaveBeenCalled();
      expect(secondSubmit).toHaveBeenCalledTimes(1);
      // Only one overlay is mounted at a time.
      expect(document.querySelectorAll("[data-intuned-picker]")).toHaveLength(
        1
      );
    });
  });

  describe("deactivatePicker", () => {
    it("unmounts the overlay and clears the cursor override", async () => {
      await session.activatePicker(
        { mode: "single", status: "picking", targets: [] },
        { onSubmit: vi.fn(), onCancel: vi.fn() }
      );
      await session.deactivatePicker();

      expect(document.querySelectorAll("[data-intuned-picker]")).toHaveLength(
        0
      );
      expect(
        document.querySelector("style[data-intuned-picker-cursor]")
      ).toBeNull();
    });
  });

  describe("testSelectors", () => {
    it("throws when no picker session is active (defensive guard for stale messages)", async () => {
      await expect(
        session.testSelectors([{ type: "css", value: ".row" }], {
          collectHtml: false,
        })
      ).rejects.toThrow(/no active picker session/i);
    });

    it("returns foundElementIds aligned with the registry the user picked against", async () => {
      const onSubmit = vi.fn();
      await session.activatePicker(
        { mode: "single", status: "picking", targets: [] },
        { onSubmit, onCancel: vi.fn() }
      );
      dispatchClick(document.getElementById("row-1")!);
      const pickedId = onSubmit.mock.calls[0][0].targets[0].elementId;

      const { selectorResults } = await session.testSelectors(
        [{ type: "css", value: "#row-1" }],
        { collectHtml: false }
      );

      expect(selectorResults).toHaveLength(1);
      // The selector resolves to the same DOM node the user picked, so its
      // registry id is the picked id — that's how the backend judges
      // candidates.
      expect(selectorResults[0].foundElementIds).toEqual([pickedId]);
    });

    it("returns elementHtmlById when collectHtml is requested, deduplicated across selectors", async () => {
      await session.activatePicker(
        { mode: "single", status: "picking", targets: [] },
        { onSubmit: vi.fn(), onCancel: vi.fn() }
      );
      dispatchClick(document.getElementById("row-1")!);

      const { selectorResults, elementHtmlById } = await session.testSelectors(
        [
          { type: "css", value: ".row" },
          { type: "css", value: "li.row" }, // matches the same nodes
        ],
        { collectHtml: true }
      );

      expect(elementHtmlById).toBeDefined();
      // Same set of elements via two selectors → one html entry per element.
      const allFoundIds = new Set(
        selectorResults.flatMap((r) => r.foundElementIds)
      );
      expect(Object.keys(elementHtmlById!).sort()).toEqual(
        Array.from(allFoundIds).sort()
      );
      // Sanity: the html actually wraps the row.
      const firstHtml = Object.values(elementHtmlById!)[0];
      expect(firstHtml).toMatch(/<li[^>]+class="row"/);
    });

    it("omits elementHtmlById when collectHtml is false", async () => {
      await session.activatePicker(
        { mode: "single", status: "picking", targets: [] },
        { onSubmit: vi.fn(), onCancel: vi.fn() }
      );
      dispatchClick(document.getElementById("row-1")!);

      const result = await session.testSelectors(
        [{ type: "css", value: ".row" }],
        { collectHtml: false }
      );

      expect(result.elementHtmlById).toBeUndefined();
    });
  });
});
