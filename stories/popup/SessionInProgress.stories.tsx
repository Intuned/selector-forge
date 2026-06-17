import type { StoryDefault } from "@ladle/react";
import { SessionInProgress } from "@/entrypoints/popup/components/SessionInProgress";
import { PopupFrame } from "../_popupFrame";
import { makeSession } from "../_mocks";

export default {
  title: "Popup/SessionInProgress",
} satisfies StoryDefault;

export function Picking() {
  return (
    <PopupFrame fill>
      <SessionInProgress session={makeSession("picking")} onCancel={() => {}} />
    </PopupFrame>
  );
}

export function Generating() {
  return (
    <PopupFrame fill>
      <SessionInProgress session={makeSession("running")} onCancel={() => {}} />
    </PopupFrame>
  );
}
