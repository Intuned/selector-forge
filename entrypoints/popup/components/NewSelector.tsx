import type { ReactNode } from "react";
import styles from "../ui.module.css";
import { CursorClick, ListIcon, TargetIcon } from "../icons";
import type { SelectorMode } from "@/lib/state";

const MODES: {
  id: SelectorMode;
  title: string;
  desc: string;
  icon: ReactNode;
}[] = [
  {
    id: "single",
    title: "Single element",
    desc: "Target one element on the page.",
    icon: <TargetIcon size={17} />,
  },
  {
    id: "list",
    title: "List of items",
    desc: "Pick a few repeated items, get one selector for all.",
    icon: <ListIcon size={17} />,
  },
];

export function NewSelector({
  mode,
  onModeChange,
  onPick,
}: {
  mode: SelectorMode;
  onModeChange: (m: SelectorMode) => void;
  onPick: (m: SelectorMode) => void;
}) {
  return (
    <>
      <div className={styles.content}>
        <p className={styles.eyebrow}>New selector</p>
        <div className={styles.modes}>
          {MODES.map((m) => {
            const selected = m.id === mode;
            return (
              <button
                key={m.id}
                type="button"
                className={`${styles.modeCard} ${
                  selected ? styles.modeCardSelected : ""
                }`}
                aria-pressed={selected}
                onClick={() => onModeChange(m.id)}
              >
                <span className={styles.modeIcon}>{m.icon}</span>
                <span className={styles.modeBody}>
                  <span className={styles.modeTitle}>{m.title}</span>
                  <span className={styles.modeDesc}>{m.desc}</span>
                </span>
                <span
                  className={`${styles.radio} ${
                    selected ? styles.radioChecked : ""
                  }`}
                >
                  {selected && <span className={styles.radioDot} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.footer}>
        <button
          id="pick-element"
          type="button"
          className={styles.btnPrimary}
          onClick={() => onPick(mode)}
        >
          <CursorClick size={15} />{" "}
          {mode === "list" ? "Pick elements" : "Pick element"}
        </button>
      </div>
    </>
  );
}
