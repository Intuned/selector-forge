import type { ContentMessagingClient } from "@/lib/messaging";
import type { PickerSession } from "@/lib/content";

export interface ContentContext {
  picker: PickerSession;
  contentMessagingClient: ContentMessagingClient;
}

export type ContentHandlerDeps = ContentContext;
