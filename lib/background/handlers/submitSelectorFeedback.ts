import { fetchIntunedApi } from "@/lib/auth";
import { getSelectorFeedbackUrl } from "@/lib/config";
import { BackgroundMessageType } from "@/lib/messaging";
import type { BackgroundHandler } from "@/lib/background";

/**
 * Forward a thumbs up/down rating to the backend feedback endpoint, which
 * attaches it to the selector's LangSmith run. Failures resolve to
 * `{ ok: false }` so the popup can revert its optimistic UI without throwing.
 */
export const handleSubmitSelectorFeedback: BackgroundHandler<
  BackgroundMessageType.SubmitSelectorFeedback
> = async ({ langsmithRunId, value, comment }) => {
  try {
    const url = await getSelectorFeedbackUrl();
    const res = await fetchIntunedApi(url, {
      method: "POST",
      body: JSON.stringify({ langsmithRunId, value, comment }),
    });
    return { ok: res.ok };
  } catch (error) {
    console.debug("[selector-extension] feedback submit failed", error);
    return { ok: false };
  }
};
