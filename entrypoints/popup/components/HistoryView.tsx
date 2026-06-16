import type { SelectorHistoryEntry } from "@/lib/state";
import styles from "../ui.module.css";
import { NewSelectorIcon } from "../icons";
import { HistoryItem } from "./HistoryItem";

export function HistoryView({
  history,
  onNew,
}: {
  history: SelectorHistoryEntry[];
  onNew: () => void;
}) {
  return (
    <>
      <div className={styles.content}>
        <div className={styles.historyList}>
          {history.map((entry) => (
            <HistoryItem key={entry.id} entry={entry} />
          ))}
        </div>
      </div>

      <div className={styles.footer}>
        <button
          id="new-selector"
          type="button"
          className={`${styles.btnPrimary}`}
          onClick={onNew}
        >
          <NewSelectorIcon size={15} /> New selector
        </button>
      </div>
    </>
  );
}
