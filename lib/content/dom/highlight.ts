import type { SelectorRecord } from "@/lib/state";
import { queryAll } from "./elementRegistry";

const HIGHLIGHT_MS = 1800;
const ACCENT = "#f2683c";

let activeLayer: HTMLElement | null = null;
let activeTimer: ReturnType<typeof setTimeout> | null = null;

function clearHighlight(): void {
  if (activeTimer !== null) {
    clearTimeout(activeTimer);
    activeTimer = null;
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

  const layer = document.createElement("div");
  layer.style.cssText =
    "position:absolute;top:0;left:0;width:0;height:0;z-index:2147483646;pointer-events:none;";

  for (const el of elements) {
    const r = el.getBoundingClientRect();
    const box = document.createElement("div");
    box.style.cssText = [
      "position:absolute",
      `left:${r.left + window.scrollX}px`,
      `top:${r.top + window.scrollY}px`,
      `width:${r.width}px`,
      `height:${r.height}px`,
      `border:2px solid ${ACCENT}`,
      "border-radius:3px",
      `background:${ACCENT}1f`,
      `box-shadow:0 0 0 2px ${ACCENT}40, 0 2px 10px ${ACCENT}55`,
      "pointer-events:none",
      "box-sizing:border-box",
    ].join(";");
    layer.appendChild(box);
  }

  document.documentElement.appendChild(layer);
  activeLayer = layer;
  activeTimer = setTimeout(clearHighlight, HIGHLIGHT_MS);

  return elements.length;
}
