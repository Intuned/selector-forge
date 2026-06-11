import { useState } from "react";
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
  const [expandedId, setExpandedId] = useState<string | null>(
    history[0]?.id ?? null
  );

  return (
    <>
      <div className={styles.content}>
        <div className={styles.historyList}>
          {history.map((entry) => (
            <HistoryItem
              key={entry.id}
              entry={entry}
              expanded={entry.id === expandedId}
              onToggle={() =>
                setExpandedId((id) => (id === entry.id ? null : entry.id))
              }
            />
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
