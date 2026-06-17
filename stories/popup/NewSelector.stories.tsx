import { useState } from "react";
import type { StoryDefault } from "@ladle/react";
import { NewSelector } from "@/entrypoints/popup/components/NewSelector";
import type { SelectorMode } from "@/lib/state";
import { PopupFrame } from "../_popupFrame";

export default {
  title: "Popup/NewSelector",
} satisfies StoryDefault;

// Stateful wrapper so the mode toggle is interactive in Ladle.
function Demo({ initial }: { initial: SelectorMode }) {
  const [mode, setMode] = useState<SelectorMode>(initial);
  return (
    <PopupFrame fill>
      <NewSelector mode={mode} onModeChange={setMode} onPick={() => {}} />
    </PopupFrame>
  );
}

export function SingleSelected() {
  return <Demo initial="single" />;
}

export function ListSelected() {
  return <Demo initial="list" />;
}
