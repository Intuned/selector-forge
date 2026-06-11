import { ContentMessageType } from "@/lib/messaging";
import { highlightSelector } from "../dom/highlight";
import type { ContentHandler } from "@/lib/content";

export const handleHighlightSelector: ContentHandler<
  ContentMessageType.HighlightSelector
> = async ({ selector }) => ({ matchCount: highlightSelector(selector) });
