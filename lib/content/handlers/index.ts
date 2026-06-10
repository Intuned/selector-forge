import { ContentMessageType } from "@/lib/messaging";
import type { ContentHandlers } from "@/lib/content";

import { handleActivatePicker } from "./activatePicker";
import { handleDeactivatePicker } from "./deactivatePicker";
import { handleTestSelectors } from "./testSelectors";

export const contentHandlers: ContentHandlers = {
  [ContentMessageType.ActivatePicker]: handleActivatePicker,
  [ContentMessageType.DeactivatePicker]: handleDeactivatePicker,
  [ContentMessageType.TestSelectors]: handleTestSelectors,
};
