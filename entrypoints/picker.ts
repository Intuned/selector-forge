import { pageMessenger } from "../lib/messaging/page";
import { startPick } from "../lib/picker";
import type { PickMode } from "../lib/types";

export default defineUnlistedScript(() => {
  const g = window as unknown as {
    __intunedStartPick?: (m?: PickMode) => void;
  };
  g.__intunedStartPick = (mode: PickMode = "single") => {
    void startPick();
    // TODO(picker UX): send the resolved selector to the content-script bridge:
    // void pageMessenger.sendMessage("selectorResult", { selector });
  };

  // Let the content-script bridge start a pick from the page side.
  pageMessenger.onMessage("startPick", ({ data }) => g.__intunedStartPick!(data));
});
