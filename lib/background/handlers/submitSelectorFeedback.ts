import { fetchIntunedApi } from "@/lib/auth";
import { getSelectorFeedbackUrl } from "@/lib/config";
import { BackgroundMessageType } from "@/lib/messaging";
import { updateSelectorHistoryEntry } from "@/lib/state";
import type { BackgroundHandler } from "@/lib/background";

/**
 * Owns the thumbs up/down rating end to end: persists it onto the local history
 * entry and forwards it to the backend feedback endpoint (which attaches it to
 * the selector's LangSmith run). The background is the single writer so the
 * popup needn't touch the (zod-backed) history store directly. Failures resolve
 * to `{ ok: false }` so the popup can revert its optimistic UI without throwing.
 */
export const handleSubmitSelectorFeedback: BackgroundHandler<
  BackgroundMessageType.SubmitSelectorFeedback
> = async ({ entryId, langsmithRunId, value, comment }) => {
  // Clearing a rating: persist locally, nothing to forward.
  if (!value) {
    await updateSelectorHistoryEntry(entryId, { feedback: undefined });
    return { ok: true };
  }
  try {
    const url = await getSelectorFeedbackUrl();
    const res = await fetchIntunedApi(url, {
      method: "POST",
      body: JSON.stringify({ langsmithRunId, value, comment }),
    });
    // Record locally only once the backend has accepted it, so the persisted
    // history never claims a rating the server rejected.
    if (res.ok) await updateSelectorHistoryEntry(entryId, { feedback: value });
    return { ok: res.ok };
  } catch (error) {
    console.debug("[selector-extension] feedback submit failed", error);
    return { ok: false };
  }
};
