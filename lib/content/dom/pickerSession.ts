import type {
  SelectorMode,
  SelectorRecord,
  SelectorResultRecord,
  SelectorStatus,
  TargetRecord,
} from "@/lib/state";
import { ElementRegistry } from "./elementRegistry";
import { buildInspectionView } from "./inspectionView";
import { PickerOverlay } from "./pickerOverlay";
import { computeXPath } from "./xpath";

export interface ActivatePickerCallbacks {
  onSubmit: (data: { targets: TargetRecord[]; inspectionView: string }) => void;
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
        onSubmit: (pickedElements) => {
          const tagged = pickedElements.map((el) => ({
            el,
            id: registry.idFor(el),
          }));

          const targets: TargetRecord[] = tagged.map(({ el, id }) => ({
            elementId: id,
            elementXpath: computeXPath(el),
          }));
          const inspectionView = buildInspectionView(tagged);
          cb.onSubmit({ targets, inspectionView });
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
