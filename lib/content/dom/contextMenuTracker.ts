/**
 * Owns the page-side right-click concern for the context-menu selector flow: the
 * capture-phase `contextmenu` listener and the resulting "last right-clicked
 * element" state. Split out of PickerSession (and injected into it) so the
 * session stays focused on the overlay + registry.
 *
 * Why capture up front: Chrome's `contextMenus.onClicked` reports the page +
 * frame but not the DOM node, and by the time a menu item fires the original
 * event target is gone — so we record it on right-click.
 */
export class ContextMenuTracker {
  private lastTarget: Element | null = null;

  /**
   * Install the capture-phase listener. Call once per content script. Capture
   * phase so we still see the target if a page handler stops propagation;
   * passive since we never preventDefault — the native menu must still open.
   */
  addContextMenuListener(): void {
    document.addEventListener(
      "contextmenu",
      (event) => {
        const target = event.target;
        this.lastTarget = target instanceof Element ? target : null;
      },
      { capture: true, passive: true }
    );
  }

  /** The element under the cursor at the most recent right-click, if any. */
  getTarget(): Element | null {
    return this.lastTarget;
  }
}
