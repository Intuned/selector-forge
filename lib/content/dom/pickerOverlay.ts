import type { SelectorMode } from "@/lib/state";
import overlayCss from "./pickerOverlay.css?raw";

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

    // Switch from `right: 12px` anchoring to explicit top/left positioning.
    this.toolbar.style.right = "auto";
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
