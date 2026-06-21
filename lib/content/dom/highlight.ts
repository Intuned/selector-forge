import type { SelectorRecord } from "@/lib/state";
import { queryAll } from "./elementRegistry";

const HIGHLIGHT_MS = 1800;
const ACCENT = "#65a30d";

let activeLayer: HTMLElement | null = null;
let activeTimer: ReturnType<typeof setTimeout> | null = null;
let activeReposition: (() => void) | null = null;

function clearHighlight(): void {
  if (activeTimer !== null) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
  if (activeReposition) {
    window.removeEventListener("scroll", activeReposition, true);
    window.removeEventListener("resize", activeReposition, true);
    activeReposition = null;
  }
  activeLayer?.remove();
  activeLayer = null;
}

/** Highlight every element matching `selector`. Returns how many were found. */
export function highlightSelector(selector: SelectorRecord): number {
  clearHighlight();

  const elements = queryAll(selector, document);
  if (elements.length === 0) return 0;

  elements[0].scrollIntoView({
    block: "center",
    inline: "center",
    behavior: "smooth",
  });

  // A fixed overlay positioned from each element's live viewport rect — no
  // document-scroll math. This stays aligned no matter which scroll container
  // moves (the page root or a nested "two scrollbar" area), where the old
  // `rect + window.scrollX/Y` approach drifted because it only knew about the
  // root scroll.
  const layer = document.createElement("div");
  layer.style.cssText =
    "position:fixed;inset:0;z-index:2147483646;pointer-events:none;";

  const boxes = elements.map(() => {
    const box = document.createElement("div");
    box.style.cssText = [
      "position:fixed",
      `border:2px solid ${ACCENT}`,
      "border-radius:3px",
      `background:${ACCENT}1f`,
      `box-shadow:0 0 0 2px ${ACCENT}33, 0 2px 8px ${ACCENT}40`,
      "pointer-events:none",
      "box-sizing:border-box",
    ].join(";");
    layer.appendChild(box);
    return box;
  });

  // Re-pin every box to its element's current viewport rect. Runs on mount and
  // on every scroll/resize for the highlight's lifetime, so the boxes follow the
  // smooth scrollIntoView as it settles and track any later scrolling.
  const reposition = (): void => {
    elements.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const box = boxes[i];
      box.style.left = `${r.left}px`;
      box.style.top = `${r.top}px`;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;
    });
  };
  reposition();

  document.documentElement.appendChild(layer);
  window.addEventListener("scroll", reposition, true);
  window.addEventListener("resize", reposition, true);
  activeLayer = layer;
  activeReposition = reposition;
  activeTimer = setTimeout(clearHighlight, HIGHLIGHT_MS);

  return elements.length;
}
