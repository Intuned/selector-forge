import type { ExtensionMessage } from "@webext-core/messaging";
import type { AgentLoopController } from "@/lib/agent";
import type { BackgroundMessagingClient } from "@/lib/messaging";
import type { SelectorState } from "@/lib/state";

export type MessageSender = ExtensionMessage["sender"];

/** Singletons that live for the lifetime of the background worker. */
export interface BackgroundContext {
  state: SelectorState;
  agentLoopController: AgentLoopController;
  backgroundMessagingClient: BackgroundMessagingClient;
}

/** Per-call dependencies — `BackgroundContext` plus the message sender. */
export interface BackgroundHandlerContext extends BackgroundContext {
  sender: MessageSender;
}
