import type { SelectorMode } from "@/lib/state";
import overlayCss from "./pickerOverlay.css?raw";

// Intuned colored mark (mirrors IntunedLogo in popup/icons.tsx). Inlined as raw
// markup because this overlay renders inside a content-script shadow root, not React.
const INTUNED_LOGO_SVG = `<svg viewBox="0 0 48 51" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M36.2428 17.6172L36.2428 17.6172L36.2473 17.6147L45.5272 12.3347L45.5426 12.326L45.5573 12.3162C45.8503 12.1209 46.2917 12.085 46.8164 12.3474C47.2635 12.5709 47.5 13.0218 47.5 13.5002V35.2601C47.5 36.8415 46.6359 38.2727 45.3572 38.9831L45.3571 38.983L45.3504 38.9869L26.4704 49.8669L26.4562 49.8751L26.4427 49.8841C26.1497 50.0794 25.7083 50.1152 25.1836 49.8529C24.7365 49.6293 24.5 49.1785 24.5 48.7001V37.9801C24.5 36.3988 25.3641 34.9676 26.6428 34.2572L26.6428 34.2572L26.6465 34.2552L31.4428 31.5372C31.4434 31.5369 31.4441 31.5365 31.4447 31.5362C33.0449 30.6462 34.1 28.878 34.1 26.9401V21.3401C34.1 19.7588 34.9641 18.3276 36.2428 17.6172Z" fill="#CC2952" stroke="#CC2952"/><path d="M30.9574 19.463L30.9574 19.463L30.9537 19.4651L26.1574 22.183C26.1568 22.1834 26.1561 22.1837 26.1555 22.184C24.5553 23.074 23.5002 24.8422 23.5002 26.7801V32.3801C23.5002 33.9614 22.6361 35.3926 21.3574 36.103L21.3573 36.1029L21.3483 36.1082L13.6683 40.5882L13.6553 40.5958L13.6429 40.6041C13.3499 40.7994 12.9085 40.8352 12.3838 40.5729C11.9367 40.3493 11.7002 39.8984 11.7002 39.4201V28.7001C11.7002 27.1188 12.5643 25.6876 13.843 24.9772L13.8503 24.9731L13.8574 24.9688L17.0505 23.053C18.6476 22.1621 19.7002 20.3957 19.7002 18.4601V14.7801C19.7002 13.1987 20.5643 11.7676 21.843 11.0572L21.843 11.0572L21.8475 11.0547L31.1274 5.77468L31.1428 5.76593L31.1575 5.75612C31.4505 5.5608 31.8919 5.52499 32.4166 5.78731C32.8637 6.01089 33.1002 6.46176 33.1002 6.9401V15.7401C33.1002 17.3214 32.2361 18.7526 30.9574 19.463Z" fill="#F27157" stroke="#F27157"/><path d="M16.5572 13.0629L16.5571 13.0628L16.5495 13.0673L13.5132 14.8251C11.9142 15.7154 10.86 17.4829 10.86 19.42V23.1C10.86 24.6813 9.99591 26.1125 8.71719 26.8229L8.71715 26.8228L8.70949 26.8272L2.64337 30.3392C2.1489 30.5823 1.67852 30.5802 1.18362 30.3327C0.73646 30.1091 0.5 29.6583 0.5 29.1799V13.02C0.5 11.4386 1.3641 10.0074 2.64282 9.29703L2.64286 9.29711L2.65071 9.29256L16.7307 1.13256L16.7443 1.12469L16.7573 1.11599C17.0503 0.920659 17.4917 0.88485 18.0164 1.14717C18.4635 1.37075 18.7 1.82162 18.7 2.29996V9.33996C18.7 10.9213 17.8359 12.3525 16.5572 13.0629Z" fill="#FFC368" stroke="#FFC368"/></svg>`;

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
    logo.innerHTML = INTUNED_LOGO_SVG;
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

    // list mode: toggle pick on click
    const existing = this.picked.indexOf(target);
    if (existing >= 0) {
      this.picked.splice(existing, 1);
    } else {
      this.picked.push(target);
    }
    this.renderSelected();
    this.updateStatus();
    if (this.doneBtn) this.doneBtn.disabled = this.picked.length === 0;
  };

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
  }

  private updateStatus(): void {
    if (this.mode === "single") {
      this.statusEl.textContent = "Click an element to pick";
    } else {
      const n = this.picked.length;
      this.statusEl.textContent =
        n === 0 ? "Click elements (list mode)" : `${n} picked`;
    }
  }
}
