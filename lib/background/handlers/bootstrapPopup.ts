import { initAuth } from "@/lib/auth";
import { BackgroundMessageType } from "@/lib/messaging";
import { loadLastMode, loadSelectorHistory } from "@/lib/state";
import type { BackgroundHandler } from "@/lib/background";

export const handleBootstrapPopup: BackgroundHandler<
  BackgroundMessageType.BootstrapPopup
> = async (_data, { state }) => {
  const [auth, history, lastMode] = await Promise.all([
    initAuth(),
    loadSelectorHistory(),
    loadLastMode(),
  ]);
  return { auth, session: state.get(), history, lastMode };
};
