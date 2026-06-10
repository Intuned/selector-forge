import { ContentMessageType } from "@/lib/messaging";
import type { ContentHandler } from "@/lib/content";

export const handleTestSelectors: ContentHandler<
  ContentMessageType.TestSelectors
> = async ({ selectors, needHtmlForFeedback }, { picker }) =>
  picker.testSelectors(selectors, {
    collectHtml: needHtmlForFeedback === true,
  });
