import { startPick } from "../lib/picker";
import type { PickMode } from "../lib/types";

export default defineUnlistedScript(() => {
  const g = window as unknown as {
    __intunedStartPick?: (m?: PickMode) => void;
  };
  g.__intunedStartPick = (mode: PickMode = "single") => {
    startPick();
  };
});
