import { initAuth } from "@/lib/auth";
import { BackgroundMessageType } from "@/lib/messaging";
import { loadSelectorHistory } from "@/lib/state";
import type { BackgroundHandler } from "@/lib/background";

export const handleBootstrapPopup: BackgroundHandler<
  BackgroundMessageType.BootstrapPopup
> = async (_data, { state }) => {
  const [auth, history] = await Promise.all([initAuth(), loadSelectorHistory()]);
  return { auth, session: state.get(), history };
};
