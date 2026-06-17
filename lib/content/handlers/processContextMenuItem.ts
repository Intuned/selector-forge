import { BackgroundMessageType, ContentMessageType } from "@/lib/messaging";
import type { ContentHandler } from "@/lib/content";

/**
 * BG -> CS, page right-click flow. Processes a clicked context-menu item: maps
 * `item.mode` to the matching action against the tracked right-clicked element,
 * then fires `StartAgent` with the same `{ targets, inspectionView }` payload the
 * overlay's Done button produces — so the agent loop downstream is identical. On
 * failure the BG side (which owns the seeded session) tears it down based on the
 * `ok: false` response.
 */
export const handleProcessContextMenuItem: ContentHandler<
  ContentMessageType.ProcessContextMenuItem
> = async ({ sessionId, item }, { picker, contentMessagingClient }) => {
  // Only the single-element item is wired today; future items branch on the mode.
  if (item.mode !== "single") {
    return { ok: false, reason: `Unsupported context-menu mode: ${item.mode}` };
  }

  const result = await picker.useContextMenuTarget({
    // Esc / Cancel on the generating overlay aborts the session, same as the
    // picker overlay's cancel.
    onCancel: () => {
      void contentMessagingClient
        .sendMessageToBackground(BackgroundMessageType.CancelPickerSession, {
          sessionId,
        })
        .catch((error) => {
          console.debug("[selector-extension] cancel send failed", error);
        });
    },
  });
  if (!result.ok) return result;

  // Await StartAgent rather than fire-and-forget: the BG worker can be evicted
  // between our `ok: true` round-trip and this send, and if StartAgent never
  // lands the agent loop never runs — the overlay we just mounted would spin on
  // "Generating selector…" forever. On a dropped send, tear the overlay down
  // locally and report failure so BG clears the seeded session.
  try {
    await contentMessagingClient.sendMessageToBackground(
      BackgroundMessageType.StartAgent,
      {
        sessionId,
        targets: result.targets,
        inspectionView: result.inspectionView,
        // The right-click flow only ever targets a single element (guarded above).
        mode: "single",
      }
    );
  } catch (error) {
    await picker.deactivatePicker();
    return {
      ok: false,
      reason: `Failed to start generation: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
  return { ok: true };
};
