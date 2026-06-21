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
> = async (_data, ctx) => {
  ctx.telemetry.trackEvent({
    name: "auth.signIn",
    properties: { authMethod: "session" },
  });
  void useBrowserSession();
};

export const handleSignOut: BackgroundHandler<
  BackgroundMessageType.SignOut
> = async (_data, ctx) => {
  ctx.telemetry.trackEvent({ name: "auth.signOut" });
  return signOut();
};

export const handleSetApiKey: BackgroundHandler<
  BackgroundMessageType.SetApiKey
> = async ({ apiKey, workspaceId }, ctx) => {
  const result = await configureApiKey(apiKey, workspaceId);
  ctx.telemetry.trackEvent({
    name: "auth.setApiKey",
    properties: {
      authMethod: "api-key",
      status: result.authenticated ? "ok" : "failed",
    },
  });
  return result;
};
