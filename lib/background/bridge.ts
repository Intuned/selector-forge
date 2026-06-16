/**
 * `__intunedBridge` — the programmatic entry point for external callers that
 * reach the background worker over CDP (`Runtime.evaluate` on the worker's
 * own context). The Intuned CLI is the consumer; see
 * apps/selector-extension/AGENT_INTEGRATION_PLAN.md §2 and the CLI transport in
 * apps/intuned-cli/src/lib/browser/extensionTransport/.
 *
 * The bridge never rejects: handler failures come back as `{ ok: false }`
 * envelopes, so a CDP `exceptionDetails` on the evaluate unambiguously means
 * "bridge missing / protocol broken" to the caller. All results must be
 * JSON-serializable (`Runtime.evaluate` returnByValue) — true for every
 * handler response, which is Zod-validated plain data.
 *
 * Security: anything able to `Runtime.evaluate` in this worker already has
 * full-browser CDP power; the bridge adds no new exposure.
 */

import { BackgroundMessageType } from "@/lib/messaging";
import { configureToken, initAuth } from "@/lib/auth";
import type { BackgroundContext, BackgroundHandlerContext } from "./context";
import type { BackgroundHandlers } from "./registerHandlers";

export type BridgeResult =
  | { ok: true; result: unknown }
  | { ok: false; error: { name: string; message: string } };

const VALID_TYPES = new Set<string>(Object.values(BackgroundMessageType));

export function installIntunedBridge(
  handlers: BackgroundHandlers,
  ctx: BackgroundContext
): void {
  (globalThis as Record<string, unknown>).__intunedBridge = {
    async handle(
      type: string,
      payload: unknown,
      accessToken?: string
    ): Promise<BridgeResult> {
      try {
        await ctx.state.ready;
        if (!VALID_TYPES.has(type)) {
          return {
            ok: false,
            error: {
              name: "UnknownMessageType",
              message: `Unknown message type: ${type}`,
            },
          };
        }
        if (accessToken) {
          await negotiateAuth(accessToken);
        }
        const handler = handlers[type as BackgroundMessageType] as (
          data: unknown,
          handlerCtx: BackgroundHandlerContext
        ) => unknown;
        const result = await handler(payload, {
          ...ctx,
          sender: undefined,
          viaBridge: true,
        });
        return { ok: true, result: result ?? null };
      } catch (error) {
        return {
          ok: false,
          error: {
            name: error instanceof Error ? error.name : "Error",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  };
}

/**
 * Auth negotiation per AGENT_INTEGRATION_PLAN.md §6: if the extension already
 * has working auth (browser session, configured api-key, or token), keep it;
 * otherwise apply the caller's token via the existing tokenProvider seam.
 */
async function negotiateAuth(accessToken: string): Promise<void> {
  try {
    const auth = await initAuth();
    if (auth.authenticated) return;
  } catch {
    // Current auth could not even be resolved (e.g. the session check failed
    // on the network) — fall through and apply the caller's token, which
    // validates locally via JWT decode.
  }
  await configureToken(accessToken);
}
