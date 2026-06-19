import type { StoryDefault } from "@ladle/react";
import { UsageBar } from "@/entrypoints/popup/components/UsageBar";
import { PopupFrame } from "../_popupFrame";

export default {
  title: "Popup/UsageBar",
} satisfies StoryDefault;

export function Default() {
  return (
    <PopupFrame>
      <UsageBar usage={{ used: 142, included: 500 }} />
    </PopupFrame>
  );
}

export function Empty() {
  return (
    <PopupFrame>
      <UsageBar usage={{ used: 0, included: 500 }} />
    </PopupFrame>
  );
}

export function NearLimit() {
  return (
    <PopupFrame>
      <UsageBar usage={{ used: 487, included: 500 }} />
    </PopupFrame>
  );
}

export function OverLimit() {
  // Bar clamps to 100% even when usage exceeds the included amount.
  return (
    <PopupFrame>
      <UsageBar usage={{ used: 640, included: 500 }} />
    </PopupFrame>
  );
}

export function Loading() {
  // `usage === null` renders the skeleton + indeterminate track.
  return (
    <PopupFrame>
      <UsageBar usage={null} />
    </PopupFrame>
  );
}
