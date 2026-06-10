import { selectorCreateStateSchema, type SelectorCreateState } from "./schema";

export interface SessionMeta {
  tabId: number;
}

const PERSIST_KEY = "session.selectorState";

interface PersistedSnapshot {
  current: SelectorCreateState | null;
  meta: SessionMeta | null;
}

export class SelectorState {
  private current: SelectorCreateState | null = null;
  private meta: SessionMeta | null = null;
  private listeners = new Set<(s: SelectorCreateState | null) => void>();

  private hydrated = false;
  private resolveReady!: () => void;

  readonly ready: Promise<void> = new Promise((resolve) => {
    this.resolveReady = resolve;
  });

  get(): SelectorCreateState | null {
    return this.current;
  }

  set(next: SelectorCreateState): void {
    this.current = next;
    this.emit();
  }

  update(patch: (prev: SelectorCreateState) => SelectorCreateState): void {
    if (!this.current) throw new Error("No active selector session");
    this.current = patch(this.current);
    this.emit();
  }

  getMeta(): SessionMeta | null {
    return this.meta;
  }

  setMeta(next: SessionMeta | null): void {
    this.meta = next;
    this.persist();
  }

  clear(): void {
    this.current = null;
    this.meta = null;
    this.emit();
  }

  isSelectorSessionSettled(): boolean {
    if (!this.current) return true;
    return this.current.status === "done" || this.current.status === "error";
  }

  subscribe(listener: (s: SelectorCreateState | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    try {
      const store = browser?.storage?.session;
      const snapshot = store
        ? ((await store.get(PERSIST_KEY))[PERSIST_KEY] as
            | PersistedSnapshot
            | undefined)
        : undefined;
      if (snapshot) {
        const parsed = selectorCreateStateSchema.safeParse(snapshot.current);
        this.current = parsed.success ? parsed.data : null;
        this.meta = this.current ? snapshot.meta ?? null : null;
      }
    } catch (error) {
      console.debug("[selector-extension] state hydrate failed", error);
    } finally {
      this.hydrated = true;
      this.resolveReady();
    }
  }

  private persist(): void {
    const store = browser?.storage?.session;
    if (!store) return;
    const snapshot: PersistedSnapshot = {
      current: this.current,
      meta: this.meta,
    };
    void store.set({ [PERSIST_KEY]: snapshot }).catch((error) => {
      console.debug("[selector-extension] state persist failed", error);
    });
  }

  private emit(): void {
    this.persist();
    for (const l of this.listeners) l(this.current);
  }
}
