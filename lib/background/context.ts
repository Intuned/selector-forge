import type { ExtensionMessage } from "@webext-core/messaging";
import type { AgentLoopController } from "@/lib/agent";
import type { BackgroundMessagingClient } from "@/lib/messaging";
import type { SelectorState } from "@/lib/state";
import type { BackgroundTelemetry } from "@/lib/telemetry";

export type MessageSender = ExtensionMessage["sender"];

/** Singletons that live for the lifetime of the background worker. */
export interface BackgroundContext {
  state: SelectorState;
  agentLoopController: AgentLoopController;
  backgroundMessagingClient: BackgroundMessagingClient;
  /** Single App Insights egress; content/popup forward items here. */
  telemetry: BackgroundTelemetry;
}

/**
 * Per-call dependencies — `BackgroundContext` plus the message sender.
 * `sender` is undefined for calls arriving through the CDP bridge
 * (see ./bridge.ts), which has no extension message sender.
 *
 * `viaBridge` marks programmatic (CLI) calls. It's the reliable way to tell
 * them apart from UI calls — `sender` is not, since popup messages also arrive
 * with no `sender.tab`. Handlers use it to skip UI-only side effects (e.g.
 * resetting the popup's saved mode) for programmatic calls.
 */
export interface BackgroundHandlerContext extends BackgroundContext {
  sender: MessageSender | undefined;
  viaBridge?: boolean;
}
