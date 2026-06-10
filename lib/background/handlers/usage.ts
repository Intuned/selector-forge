import { getSelectorCreationUsage } from "@/lib/graphql/usage";
import { BackgroundMessageType } from "@/lib/messaging";
import type { BackgroundHandler } from "@/lib/background";

// Runs in the background so the bearer token resolves and the GraphQL fetch
// isn't blocked by the popup's origin.
export const handleGetSelectorCreationUsage: BackgroundHandler<
  BackgroundMessageType.GetSelectorCreationUsage
> = async () => getSelectorCreationUsage();
