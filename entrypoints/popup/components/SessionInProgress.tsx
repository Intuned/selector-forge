import type { SelectorCreateState } from "@/lib/state";
import styles from "../ui.module.css";

export function SessionInProgress({
  session,
  onCancel,
}: {
  session: SelectorCreateState;
  onCancel: () => void;
}) {
  const picking = session.status === "picking";
  let host = session.page.origin;
  try {
    host = new URL(session.page.url).host;
  } catch {
    /* keep origin fallback */
  }

  return (
    <div className={styles.center}>
      <div className={styles.spinner} />
      <p id="status" className={styles.status}>
        {picking ? "Pick an element on the page." : "Generating selector…"}
      </p>
      <p className={styles.sessionHint}>
        A selector is already in progress on <strong>{host}</strong>. Finish it
        there, or cancel to start a new one.
      </p>
      <button
        type="button"
        className={`${styles.btnGhost} ${styles.btnAuto}`}
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}
