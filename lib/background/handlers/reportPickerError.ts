import { BackgroundMessageType } from "@/lib/messaging";
import type { BackgroundHandler } from "@/lib/background";

/**
 * Content -> BG. Picker raised something unrecoverable (frame-blocked page,
 * DOM gone after nav, etc.). Records the error on session state and
 * surfaces it to the popup via `SelectorGenerationSettled`.
 */
export const handleReportPickerError: BackgroundHandler<
  BackgroundMessageType.ReportPickerError
> = async (_data, _deps) => {
  throw new Error("handleReportPickerError not implemented");
};
