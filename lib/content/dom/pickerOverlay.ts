import type { SelectorMode } from "@/lib/state";
import overlayCss from "./pickerOverlay.css?raw";
import { computeXPath } from "./xpath";
import { predictListMatches } from "./predictListItems";

// Selector Forge mark (mirrors ForgeLogo in popup/icons.tsx). Inlined as raw
// markup because this overlay renders inside a content-script shadow root, not React.
const FORGE_LOGO_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" fill="#C8FF2E"/><g fill="#0B0B0B" transform="translate(2 6.3056) scale(0.277778)"><path d="M1.4788e-06 3.31909H18.8934L18.8913 15.1392L13.6938 15.1442C12.6571 15.1447 11.304 15.1821 10.2979 15.0935C7.68967 14.8622 5.24424 13.7268 3.38445 11.8835C0.950513 9.48717 0.0160763 6.66674 1.4788e-06 3.31909Z"/><path d="M65.7514 0.0140934C67.577 0.0231792 69.4024 0.0185198 71.2279 -1.19442e-06C71.2262 1.03916 71.2167 2.09043 71.2284 3.12842C64.0971 3.86367 59.8285 8.2592 58.4106 15.1414C55.9854 15.1342 53.3695 15.1855 50.9627 15.1303C47.5129 15.1971 43.8809 15.1414 40.4106 15.1409L20.5312 15.1381C20.5774 13.3623 20.5473 11.4737 20.5473 9.69067L20.5458 0.00197904C25.8852 0.0629003 31.3093 0.0153747 36.6537 0.0153747L65.7514 0.0140934Z"/><path d="M23.9733 16.8621C24.4506 16.7846 26.3549 16.8231 26.9644 16.8236L33.2499 16.8264L46.1653 16.8248C48.4668 16.8248 51.0709 16.7679 53.3468 16.856C50.9009 18.973 49.2917 21.2583 48.9923 24.5782C48.6619 28.2369 50.7209 32.1197 53.5965 34.3098C51.1311 34.3152 48.465 34.366 46.0148 34.3114C45.8224 34.3264 45.8113 34.3281 45.6213 34.3008C45.5025 34.1776 45.2377 33.4352 45.1056 33.1843C44.157 31.3823 42.5829 30.0796 40.6152 29.515C38.7489 28.986 36.7488 29.2202 35.0552 30.1661C33.4638 31.0551 32.1751 32.5556 31.671 34.3192C29.004 34.2958 26.332 34.337 23.6616 34.3036C29.5647 29.4564 29.9295 21.8731 23.9581 16.9268L23.9733 16.8621Z"/><path d="M15.3425 40.5805V35.991H33.0482C33.0482 32.9674 35.4993 30.5162 38.5229 30.5162C41.5466 30.5162 43.9977 32.9674 43.9977 35.991H61.9363V40.5805H15.3425Z"/></g></svg>`;

export interface PickerCallbacks {
  onSubmit?: (picked: Element[]) => void;
  onCancel?: () => void;
}

export class PickerOverlay {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private hoverBox: HTMLDivElement;
  private selectedLayer: HTMLDivElement;
  private toolbar: HTMLDivElement;
  private statusEl: HTMLSpanElement;
  private doneBtn: HTMLButtonElement | null = null;
  private currentHover: Element | null = null;

  // non-ui state of the picker
  private picked: Element[] = [];
  // Locked, auto-derived list items (list mode, 2+ picks). Display-only — these
  // preview what one reliable selector would catch and are never submitted.
  private predicted: Element[] = [];
  private submitted = false;

  // Drag state for the movable toolbar.
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  constructor(
    private readonly mode: SelectorMode,
    private readonly cb: PickerCallbacks,
    initialSubmitted: boolean = false
  ) {
    this.host = document.createElement("div");
    this.host.setAttribute("data-intuned-picker", "");
    Object.assign(this.host.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      zIndex: "2147483647",
    });
    this.root = this.host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = overlayCss;
    this.root.appendChild(style);

    this.hoverBox = document.createElement("div");
    this.hoverBox.className = "hover-box";
    this.selectedLayer = document.createElement("div");
    this.selectedLayer.className = "layer";
    this.toolbar = document.createElement("div");
    this.toolbar.className = "toolbar";

    const grip = document.createElement("span");
    grip.className = "grip";
    grip.title = "Drag to move";
    this.toolbar.appendChild(grip);

    const logo = document.createElement("span");
    logo.className = "logo";
    logo.setAttribute("aria-hidden", "true");
    logo.innerHTML = FORGE_LOGO_SVG;
    this.toolbar.appendChild(logo);

    this.statusEl = document.createElement("span");
    this.statusEl.className = "status";
    this.toolbar.appendChild(this.statusEl);

    if (mode === "list") {
      this.doneBtn = document.createElement("button");
      this.doneBtn.className = "done";
      this.doneBtn.innerHTML = 'Done <span class="kbd">⏎</span>';
      this.doneBtn.disabled = true;
      this.doneBtn.title = "Done (Enter)";
      this.doneBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.submitted) return;
        if (this.picked.length > 0) this.commitSubmit();
      });
      this.toolbar.appendChild(this.doneBtn);
    }

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "cancel";
    cancelBtn.innerHTML = 'Cancel <span class="kbd">Esc</span>';
    cancelBtn.title = "Cancel (Esc)";
    cancelBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.cb.onCancel?.();
    });
    this.toolbar.appendChild(cancelBtn);

    this.toolbar.addEventListener("mousedown", this.handleToolbarMouseDown);

    this.root.appendChild(this.hoverBox);
    this.root.appendChild(this.selectedLayer);
    this.root.appendChild(this.toolbar);

    if (initialSubmitted) {
      this.enterSubmittedState();
    } else {
      this.updateStatus();
    }
  }

  private enterSubmittedState(): void {
    this.submitted = true;
    // remove hover & selection ui and disable actions
    this.hoverBox.remove();
    this.selectedLayer.remove();
    this.statusEl.textContent = "Generating selector…";
    if (this.doneBtn) this.doneBtn.disabled = true;
  }

  private get windowListeners(): [keyof WindowEventMap, EventListener][] {
    return [
      ["mousemove", this.handleMouseMove as EventListener],
      ["click", this.handleClick as EventListener],
      ["mousedown", this.handleMouseDown as EventListener],
      ["mouseup", this.handleMouseUp as EventListener],
      ["keydown", this.handleKeyDown as EventListener],
      ["scroll", this.handleViewportChange],
      ["resize", this.handleViewportChange],
    ];
  }

  mount(): void {
    document.documentElement.appendChild(this.host);
    this.installCursorOverride();
    for (const [type, handler] of this.windowListeners) {
      window.addEventListener(type, handler, { capture: true });
    }
  }

  unmount(): void {
    for (const [type, handler] of this.windowListeners) {
      window.removeEventListener(type, handler, true);
    }
    this.removeCursorOverride();
    this.host.remove();
  }

  private cursorStyle: HTMLStyleElement | null = null;
  private installCursorOverride(): void {
    if (this.cursorStyle) return;
    const style = document.createElement("style");
    style.setAttribute("data-intuned-picker-cursor", "");
    style.textContent = `*, *::before, *::after { cursor: default !important; }`;
    document.head.appendChild(style);
    this.cursorStyle = style;
  }
  private removeCursorOverride(): void {
    this.cursorStyle?.remove();
    this.cursorStyle = null;
  }

  private isOnOwnUI(e: Event): boolean {
    return e.composedPath().includes(this.host);
  }

  private handleMouseMove = (e: MouseEvent): void => {
    if (this.isDragging) {
      e.preventDefault();
      e.stopPropagation();
      this.toolbar.style.left = `${e.clientX - this.dragOffsetX}px`;
      this.toolbar.style.top = `${e.clientY - this.dragOffsetY}px`;
      return;
    }
    if (this.submitted) return; // hoverBox detached after submit
    if (this.isOnOwnUI(e)) {
      this.hideHover();
      return;
    }
    const target = e.target;
    if (!(target instanceof Element)) {
      this.hideHover();
      return;
    }
    this.currentHover = target;
    this.positionBox(this.hoverBox, target);
    this.hoverBox.style.display = "block";
  };

  private handleClick = (e: MouseEvent): void => {
    if (this.isOnOwnUI(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (this.submitted) return;
    const target = e.target;
    if (!(target instanceof Element)) return;

    if (this.mode === "single") {
      this.picked = [target];
      this.renderSelected();
      this.commitSubmit();
      return;
    }

    // toggle pick on click
    const existing = this.picked.indexOf(target);
    if (existing >= 0) {
      this.picked.splice(existing, 1);
    } else {
      this.picked.push(target);
    }
    this.recomputePredictions();
    this.renderSelected();
    this.updateStatus();
    if (this.doneBtn) this.doneBtn.disabled = this.picked.length === 0;
  };

  private recomputePredictions(): void {
    if (this.mode !== "list" || this.picked.length < 2) {
      this.predicted = [];
      return;
    }
    const xpaths = this.picked
      .map((el) => computeXPath(el))
      .filter((x): x is string => !!x);
    if (xpaths.length < 2) {
      this.predicted = [];
      return;
    }
    const pickedSet = new Set(this.picked);
    this.predicted = predictListMatches(xpaths).filter(
      (el) => !pickedSet.has(el)
    );
  }

  /** Fire onSubmit and lock the overlay so further clicks are ignored. */
  private commitSubmit(): void {
    this.enterSubmittedState();
    this.cb.onSubmit?.(this.picked);
  }

  /** Pointer-down on the toolbar (background, not a button) starts a drag. */
  private handleToolbarMouseDown = (e: MouseEvent): void => {
    const path = e.composedPath();
    if (path.some((n) => n instanceof Element && n.tagName === "BUTTON")) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    const rect = this.toolbar.getBoundingClientRect();
    this.dragOffsetX = e.clientX - rect.left;
    this.dragOffsetY = e.clientY - rect.top;
    this.isDragging = true;

    // Switch from the default bottom-center anchoring (bottom + translateX)
    // to explicit top/left positioning. `rect` already reflects the centering
    // transform, so clearing it keeps the bar visually in place.
    this.toolbar.style.right = "auto";
    this.toolbar.style.bottom = "auto";
    this.toolbar.style.transform = "none";
    this.toolbar.style.top = `${rect.top}px`;
    this.toolbar.style.left = `${rect.left}px`;
    this.toolbar.classList.add("dragging");
  };

  /** Suppress page mousedown unless we're on our own UI. */
  private handleMouseDown = (e: MouseEvent): void => {
    if (this.isOnOwnUI(e)) return;
    e.preventDefault();
    e.stopPropagation();
  };

  /** End drag if one was in flight, otherwise suppress page mouseup. */
  private handleMouseUp = (e: MouseEvent): void => {
    if (this.isDragging) {
      e.preventDefault();
      e.stopPropagation();
      this.isDragging = false;
      this.toolbar.classList.remove("dragging");
      return;
    }
    if (this.isOnOwnUI(e)) return;
    e.preventDefault();
    e.stopPropagation();
  };

  /** Esc cancels (always). Enter submits in list mode when at least one pick. */
  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.cb.onCancel?.();
      return;
    }
    if (
      e.key === "Enter" &&
      this.mode === "list" &&
      !this.submitted &&
      this.picked.length > 0
    ) {
      e.preventDefault();
      e.stopPropagation();
      this.commitSubmit();
    }
  };

  private handleViewportChange = (): void => {
    if (this.submitted) return; // hoverBox & selectedLayer detached after submit
    if (this.currentHover && this.currentHover.isConnected) {
      this.positionBox(this.hoverBox, this.currentHover);
    }
    this.renderSelected();
  };

  private hideHover(): void {
    this.hoverBox.style.display = "none";
  }

  private positionBox(box: HTMLDivElement, el: Element): void {
    const r = el.getBoundingClientRect();
    box.style.top = `${r.top}px`;
    box.style.left = `${r.left}px`;
    box.style.width = `${r.width}px`;
    box.style.height = `${r.height}px`;
  }

  private renderSelected(): void {
    this.selectedLayer.replaceChildren();
    for (const el of this.picked) {
      if (!el.isConnected) continue;
      const box = document.createElement("div");
      box.className = "sel-box";
      this.positionBox(box, el);
      this.selectedLayer.appendChild(box);
    }

    for (const el of this.predicted) {
      if (!el.isConnected) continue;
      const box = document.createElement("div");
      box.className = "predicted-box";
      const pill = document.createElement("span");
      pill.className = "predicted-pill";
      pill.textContent = "predicted";
      box.appendChild(pill);
      this.positionBox(box, el);
      this.selectedLayer.appendChild(box);
    }
  }

  private updateStatus(): void {
    if (this.mode === "single") {
      this.statusEl.textContent = "Click an element to pick";
      return;
    }
    const n = this.picked.length;
    if (n === 0) {
      this.statusEl.textContent = "Click elements (list mode)";
    } else if (this.predicted.length > 0) {
      const total = n + this.predicted.length;
      this.statusEl.textContent = `${n} picked · ${total} items predicted`;
    } else {
      this.statusEl.textContent = `${n} picked`;
    }
  }
}
