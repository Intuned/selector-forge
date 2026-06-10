import { ContentMessageType } from "@/lib/messaging";
import type { ContentHandler } from "@/lib/content";

export const handleDeactivatePicker: ContentHandler<
  ContentMessageType.DeactivatePicker
> = async (_data, { picker }) => {
  await picker.deactivatePicker();
};
