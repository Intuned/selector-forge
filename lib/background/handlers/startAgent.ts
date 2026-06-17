import { BackgroundMessageType } from "@/lib/messaging";
import { saveLastMode } from "@/lib/state";
import type { BackgroundHandler } from "@/lib/background";

export const handleStartAgent: BackgroundHandler<
  BackgroundMessageType.StartAgent
> = async (
  { sessionId, targets, inspectionView, mode },
  { state, agentLoopController }
) => {
  const current = state.get();
  // basic check to avoid folding into the wrong session if something messed up
  if (!current || current.sessionId !== sessionId) {
    return;
  }

  // if the commited mode for the picker changed, persist it
  if (mode !== current.mode) {
    await saveLastMode(mode);
  }

  state.update((prev) => ({
    ...prev,
    mode,
    status: "running",
    targets,
    example: {
      inspectionView,
      targetElementIds: targets.map((t) => t.elementId),
    },
  }));

  void agentLoopController.runAgentLoop(sessionId);
};
