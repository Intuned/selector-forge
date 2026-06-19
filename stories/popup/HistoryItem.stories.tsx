import type { StoryDefault } from "@ladle/react";
import { HistoryItem } from "@/entrypoints/popup/components/HistoryItem";
import { PopupFrame } from "../_popupFrame";
import { makeHistoryEntry } from "../_mocks";

export default {
  title: "Popup/HistoryItem",
} satisfies StoryDefault;

export function Css() {
  return (
    <PopupFrame>
      <HistoryItem entry={makeHistoryEntry()} />
    </PopupFrame>
  );
}

export function Xpath() {
  return (
    <PopupFrame>
      <HistoryItem
        entry={makeHistoryEntry({
          selector: { type: "xpath", value: "//a[@class='titlelink']" },
          matchCount: 30,
        })}
      />
    </PopupFrame>
  );
}

export function Rated() {
  return (
    <PopupFrame>
      <HistoryItem entry={makeHistoryEntry({ feedback: "up" })} />
    </PopupFrame>
  );
}

export function Fallback() {
  // No langsmithRunId → "couldn't generate" note + no feedback controls.
  return (
    <PopupFrame>
      <HistoryItem
        entry={makeHistoryEntry({ langsmithRunId: undefined, matchCount: 0 })}
      />
    </PopupFrame>
  );
}

export function LongSelector() {
  // Overflowing value enables the expand/show-full control.
  return (
    <PopupFrame>
      <HistoryItem
        entry={makeHistoryEntry({
          selector: {
            type: "css",
            value:
              "div.app > main.content section.results ul.list li.item:nth-child(3) a.product-card__title span.label",
          },
        })}
      />
    </PopupFrame>
  );
}
