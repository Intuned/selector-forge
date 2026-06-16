import { ContentMessageType } from "@/lib/messaging";
import type { ContentHandlers } from "@/lib/content";

import { handleActivatePicker } from "./activatePicker";
import { handleProcessContextMenuItem } from "./processContextMenuItem";
import { handleDeactivatePicker } from "./deactivatePicker";
import { handleTestSelectors } from "./testSelectors";
import { handleHighlightSelector } from "./highlightSelector";

export const contentHandlers: ContentHandlers = {
  [ContentMessageType.ActivatePicker]: handleActivatePicker,
  [ContentMessageType.ProcessContextMenuItem]: handleProcessContextMenuItem,
  [ContentMessageType.DeactivatePicker]: handleDeactivatePicker,
  [ContentMessageType.TestSelectors]: handleTestSelectors,
  [ContentMessageType.HighlightSelector]: handleHighlightSelector,
};
