import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PickerOverlay } from "../../lib/content/dom/pickerOverlay";

/**
 * Real-browser behavior of the picker overlay. These cover what only a real
 * renderer can prove — page-event suppression with capture-phase listeners,
 * shadow-DOM hosting, cursor override installation/teardown — without trying
 * to test every internal CSS class.
 */

function dispatchClick(target: Element): MouseEvent {
  const evt = new MouseEvent("click", { bubbles: true, cancelable: true });
  target.dispatchEvent(evt);
  return evt;
}

function dispatchMouseDown(target: Element): MouseEvent {
  const evt = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  target.dispatchEvent(evt);
  return evt;
}

function dispatchKey(key: string): KeyboardEvent {
  const evt = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(evt);
  return evt;
}

describe("PickerOverlay", () => {
  let overlay: PickerOverlay | null = null;
  let onSubmit: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = `
      <a id="link" href="/should-not-navigate">link</a>
      <button id="btn" type="button">btn</button>
      <ul>
        <li id="a">A</li>
        <li id="b">B</li>
        <li id="c">C</li>
      </ul>
    `;
    onSubmit = vi.fn();
    onCancel = vi.fn();
  });

  afterEach(() => {
    overlay?.unmount();
    overlay = null;
    // Safety net in case a test threw between mount and unmount.
    document
      .querySelectorAll("[data-intuned-picker], [data-intuned-picker-cursor]")
      .forEach((n) => n.remove());
    document.body.innerHTML = "";
  });

  describe("mount / unmount", () => {
    it("attaches a single host to <html> and a cursor-override <style> to <head>", () => {
      overlay = new PickerOverlay("single", { onSubmit, onCancel });
      overlay.mount();

      expect(document.querySelectorAll("[data-intuned-picker]")).toHaveLength(
        1
      );
      expect(
        document.querySelector("style[data-intuned-picker-cursor]")
      ).not.toBeNull();
    });

    it("removes both on unmount", () => {
      overlay = new PickerOverlay("single", { onSubmit, onCancel });
      overlay.mount();
      overlay.unmount();
      overlay = null;

      expect(document.querySelectorAll("[data-intuned-picker]")).toHaveLength(
        0
      );
      expect(
        document.querySelector("style[data-intuned-picker-cursor]")
      ).toBeNull();
    });

    it("forces a default cursor on the page while mounted (overriding text/pointer cursors)", () => {
      overlay = new PickerOverlay("single", { onSubmit, onCancel });
      overlay.mount();

      const link = document.getElementById("link")!;
      expect(getComputedStyle(link).cursor).toBe("default");
    });
  });

  describe("single mode", () => {
    beforeEach(() => {
      overlay = new PickerOverlay("single", { onSubmit, onCancel });
      overlay.mount();
    });

    it("commits the clicked element on the first click", () => {
      const target = document.getElementById("a")!;
      dispatchClick(target);

      expect(onSubmit).toHaveBeenCalledExactlyOnceWith([target]);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it("suppresses the page click — a real <a href> does not navigate, a <button> does not fire", () => {
      const link = document.getElementById("link")!;
      const button = document.getElementById("btn")!;
      const buttonClickSpy = vi.fn();
      button.addEventListener("click", buttonClickSpy);

      const linkEvt = dispatchClick(link);
      const buttonEvt = dispatchClick(button);

      expect(linkEvt.defaultPrevented).toBe(true);
      expect(buttonEvt.defaultPrevented).toBe(true);
      // The page handler never fires — the overlay stops propagation in the
      // capture phase before bubbling reaches the button.
      expect(buttonClickSpy).not.toHaveBeenCalled();
    });

    it("locks after submit — subsequent clicks are ignored", () => {
      dispatchClick(document.getElementById("a")!);
      dispatchClick(document.getElementById("b")!);
      dispatchClick(document.getElementById("c")!);

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0][0]).toEqual([document.getElementById("a")]);
    });

    it("Esc cancels without submitting", () => {
      dispatchKey("Escape");

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe("list mode", () => {
    beforeEach(() => {
      overlay = new PickerOverlay("list", { onSubmit, onCancel });
      overlay.mount();
    });

    it("toggles the picked set on repeated clicks without submitting", () => {
      const a = document.getElementById("a")!;
      const b = document.getElementById("b")!;

      dispatchClick(a);
      dispatchClick(b);
      dispatchClick(a); // toggles A back off

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("Enter commits the current pick order", () => {
      const a = document.getElementById("a")!;
      const c = document.getElementById("c")!;

      dispatchClick(a);
      dispatchClick(c);
      dispatchKey("Enter");

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0][0]).toEqual([a, c]);
    });

    it("Enter does nothing when no element is picked", () => {
      dispatchKey("Enter");
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("Esc cancels (overrides any partial pick)", () => {
      dispatchClick(document.getElementById("a")!);
      dispatchKey("Escape");

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("further clicks are ignored after commit", () => {
      dispatchClick(document.getElementById("a")!);
      dispatchKey("Enter");
      dispatchClick(document.getElementById("b")!);

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  describe("event suppression while idle", () => {
    it("suppresses page mousedowns so drag-select / focus changes don't fire", () => {
      overlay = new PickerOverlay("single", { onSubmit, onCancel });
      overlay.mount();

      const evt = dispatchMouseDown(document.getElementById("link")!);
      expect(evt.defaultPrevented).toBe(true);
    });
  });
});
