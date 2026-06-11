import type {
  FinalSelectorResult,
  SelectorCreateState,
  SelectorHistoryEntry,
  SelectorMode,
} from "@/lib/state";
import type { AuthState } from "@/lib/auth";
import styles from "../ui.module.css";
import { UndoIcon } from "../icons";
import { AuthPanel } from "./AuthPanel";
import { HistoryView } from "./HistoryView";
import { NewSelector } from "./NewSelector";
import { SessionInProgress } from "./SessionInProgress";

export function Body(props: {
  loading: boolean;
  bootstrapError: string | null;
  authState: AuthState | null;
  session: SelectorCreateState | null;
  selectorGenerationError: FinalSelectorResult | null;
  history: SelectorHistoryEntry[];
  showPicker: boolean;
  mode: SelectorMode;
  onModeChange: (m: SelectorMode) => void;
  onPick: (m: SelectorMode) => void;
  onNew: () => void;
  onOpenPicker: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onAuthChange: (s: AuthState) => void;
}) {
  const {
    loading,
    bootstrapError,
    authState,
    session,
    selectorGenerationError,
    history,
    showPicker,
    mode,
    onModeChange,
    onPick,
    onNew,
    onOpenPicker,
    onCancel,
    onRetry,
    onAuthChange,
  } = props;

  if (loading) {
    return (
      <div className={styles.center}>
        <div className={styles.spinner} />
        <p className={styles.status}>Loading…</p>
      </div>
    );
  }

  if (bootstrapError) {
    return (
      <div className={styles.center}>
        <p id="status" className={styles.status}>
          {bootstrapError}
        </p>
        <button
          type="button"
          className={`${styles.btnGhost} ${styles.btnAuto}`}
          onClick={onRetry}
        >
          <UndoIcon size={14} /> Retry
        </button>
      </div>
    );
  }

  if (!authState?.authenticated) {
    return <AuthPanel authState={authState} onAuthChange={onAuthChange} />;
  }

  if (
    session?.status === "picking" ||
    session?.status === "running" ||
    session?.status === "awaiting_browser"
  ) {
    return <SessionInProgress session={session} onCancel={onCancel} />;
  }

  // Successful results live in `history`; only errors get a dedicated view.
  if (selectorGenerationError && selectorGenerationError.status === "error") {
    return (
      <div className={styles.center}>
        <p id="status" className={styles.status}>
          {selectorGenerationError.note ?? "Could not generate selector."}
        </p>
        <button
          type="button"
          className={`${styles.btnGhost} ${styles.btnAuto}`}
          onClick={onNew}
        >
          <UndoIcon size={14} /> Go back
        </button>
      </div>
    );
  }

  if (showPicker || history.length === 0) {
    return (
      <NewSelector mode={mode} onModeChange={onModeChange} onPick={onPick} />
    );
  }

  return <HistoryView history={history} onNew={onOpenPicker} />;
}
