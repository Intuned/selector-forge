import {
  configureApiKey,
  initAuth,
  signOut,
  useBrowserSession,
} from "@/lib/auth";
import { BackgroundMessageType } from "@/lib/messaging";
import type { BackgroundHandler } from "@/lib/background";

export const handleInitializeAuth: BackgroundHandler<
  BackgroundMessageType.InitializeAuth
> = async () => initAuth();

export const handleSignIn: BackgroundHandler<
  BackgroundMessageType.SignIn
> = async () => {
  void useBrowserSession();
};

export const handleSignOut: BackgroundHandler<
  BackgroundMessageType.SignOut
> = async () => signOut();

export const handleSetApiKey: BackgroundHandler<
  BackgroundMessageType.SetApiKey
> = async ({ apiKey }) => configureApiKey(apiKey);
