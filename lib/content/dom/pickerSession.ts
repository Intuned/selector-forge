import type {
  SelectorMode,
  SelectorRecord,
  SelectorResultRecord,
  SelectorStatus,
  TargetRecord,
} from "@/lib/state";
import { ContextMenuTracker } from "./contextMenuTracker";
import { ElementRegistry } from "./elementRegistry";
import { buildInspectionView } from "./inspectionView";
import { PickerOverlay } from "./pickerOverlay";
import { computeXPath } from "./xpath";

export interface ActivatePickerCallbacks {
  onSubmit: (data: {
    targets: TargetRecord[];
    inspectionView: string;
    mode: SelectorMode;
  }) => void;
  onCancel: () => void;
}

export interface ActivatePickerInput {
  mode: SelectorMode;
  status: SelectorStatus;
  targets: TargetRecord[];
}

export type ActivatePickerResult = { ok: true } | { ok: false; reason: string };

// Strict resolver: returns the element iff the xpath matches exactly one node.
function resolveSingleByXpath(xpath: string): Element | null {
  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    if (result.snapshotLength !== 1) return null;
    const node = result.snapshotItem(0);
    return node instanceof Element ? node : null;
  } catch {
    return null;
  }
}

export class PickerSession {
  private currentRegistry: ElementRegistry | null = null;
  private currentOverlay: PickerOverlay | null = null;

  // The right-click concern (listener + last-target state) is encapsulated in
  // ContextMenuTracker and injected, keeping this class focused on the overlay
  // and registry.
  constructor(private readonly contextMenu: ContextMenuTracker) {}

  /**
   * Use the most recently right-clicked element (the context-menu target) as the
   * sole target (single mode), mirroring what the overlay's `onSubmit` produces:
   * a registry kept alive for the agent loop's `testSelectors`, plus a target
   * record + inspection view. Also mounts the overlay in its "Generating
   * selector…" state so the page right-click flow shows the same in-page status
   * as the popup pick flow. The overlay is torn down on `DeactivatePicker`
   * (settle or cancel).
   */
  async useContextMenuTarget(cb: { onCancel: () => void }): Promise<
    | { ok: true; targets: TargetRecord[]; inspectionView: string }
    | { ok: false; reason: string }
  > {
    const el = this.contextMenu.getTarget();
    if (!el || !el.isConnected) {
      return { ok: false, reason: "No right-clicked element to use." };
    }

    // Drop any stale overlay/registry, then anchor a fresh one on the element.
    await this.deactivatePicker();
    const registry = new ElementRegistry();
    this.currentRegistry = registry;

    const id = registry.idFor(el);
    const targets: TargetRecord[] = [
      { elementId: id, elementXpath: computeXPath(el) },
    ];
    const inspectionView = buildInspectionView([{ el, id }]);

    // Mount the overlay in its submitted/generating state ("Generating
    // selector…") while the agent loop runs.
    const overlay = new PickerOverlay("single", { onCancel: cb.onCancel }, true);
    this.currentOverlay = overlay;
    overlay.mount();

    return { ok: true, targets, inspectionView };
  }

  async activatePicker(
    { mode, status, targets }: ActivatePickerInput,
    cb: ActivatePickerCallbacks
  ): Promise<ActivatePickerResult> {
    // Replace any stale session — the handler may have been re-fired.
    await this.deactivatePicker();

    if (status === "picking") {
      const registry = new ElementRegistry();
      this.currentRegistry = registry;

      const overlay = new PickerOverlay(mode, {
        onSubmit: (pickedElements, submittedMode) => {
          const tagged = pickedElements.map((el) => ({
            el,
            id: registry.idFor(el),
          }));
          const targets: TargetRecord[] = tagged.map(({ el, id }) => ({
            elementId: id,
            elementXpath: computeXPath(el),
          }));
          const inspectionView = buildInspectionView(tagged);
          cb.onSubmit({ targets, inspectionView, mode: submittedMode });
        },
        onCancel: () => cb.onCancel(),
      });
      this.currentOverlay = overlay;
      overlay.mount();
      return { ok: true };
    }

    if (status === "running" || status === "awaiting_browser") {
      // regenerate the targets for the interrupted session via their xpaths
      const registry = new ElementRegistry();
      for (const t of targets) {
        if (!t.elementXpath) {
          return {
            ok: false,
            reason: `Target ${t.elementId} has no xpath to re-anchor.`,
          };
        }
        const el = resolveSingleByXpath(t.elementXpath);
        if (!el) {
          return {
            ok: false,
            reason: `Could not relocate target ${t.elementId} on the current page.`,
          };
        }
        registry.register(el, t.elementId);
      }
      this.currentRegistry = registry;

      // re-mount the overlay on post-submission state
      const overlay = new PickerOverlay(
        mode,
        {
          onCancel: () => cb.onCancel(),
        },
        true
      );
      this.currentOverlay = overlay;
      overlay.mount();
      return { ok: true };
    }

    // done / error — nothing to mount.
    return { ok: true };
  }

  async deactivatePicker(): Promise<void> {
    this.currentOverlay?.unmount();
    this.currentOverlay = null;
    this.currentRegistry?.release();
    this.currentRegistry = null;
  }

  async testSelectors(
    selectors: SelectorRecord[],
    opts: { collectHtml: boolean }
  ): Promise<{
    selectorResults: SelectorResultRecord[];
    elementHtmlById?: Record<string, string>;
  }> {
    const registry = this.currentRegistry;
    if (!registry) {
      throw new Error("testSelectors called with no active picker session");
    }

    const selectorResults: SelectorResultRecord[] = selectors.map(
      (selector) => ({
        selector,
        foundElementIds: registry.idsForSelector(selector, document),
      })
    );

    if (!opts.collectHtml) return { selectorResults };

    const elementHtmlById: Record<string, string> = {};
    for (const { foundElementIds } of selectorResults) {
      for (const id of foundElementIds) {
        if (!(id in elementHtmlById)) {
          elementHtmlById[id] = registry.htmlFor(id);
        }
      }
    }
    return { selectorResults, elementHtmlById };
  }
}
