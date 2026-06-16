import { ContentMessageType } from "@/lib/messaging";
import { highlightSelector } from "../dom/highlight";
import { queryAll } from "../dom/elementRegistry";
import type { ContentHandler } from "@/lib/content";

export const handleHighlightSelector: ContentHandler<
  ContentMessageType.HighlightSelector
> = async ({ selector, countOnly }) =>
  countOnly
    ? { matchCount: queryAll(selector, document).length }
    : { matchCount: highlightSelector(selector) };
