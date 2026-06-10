import { BackgroundMessageType } from "@/lib/messaging";
import type { BackgroundHandler } from "@/lib/background";

export const handleStartAgent: BackgroundHandler<
  BackgroundMessageType.StartAgent
> = async (
  { sessionId, targets, inspectionView },
  { state, agentLoopController }
) => {
  const current = state.get();
  // basic check to avoid folding into the wrong session if something messed up
  if (!current || current.sessionId !== sessionId) {
    return;
  }

  state.update((prev) => ({
    ...prev,
    status: "running",
    targets,
    example: {
      inspectionView,
      targetElementIds: targets.map((t) => t.elementId),
    },
  }));

  void agentLoopController.runAgentLoop(sessionId);
};
