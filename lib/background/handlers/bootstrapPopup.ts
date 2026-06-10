import { initAuth } from "@/lib/auth";
import { BackgroundMessageType } from "@/lib/messaging";
import type { BackgroundHandler } from "@/lib/background";

export const handleBootstrapPopup: BackgroundHandler<
  BackgroundMessageType.BootstrapPopup
> = async (_data, { state }) => {
  const auth = await initAuth();
  return { auth, session: state.get() };
};
