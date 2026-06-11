import { fetchIntunedApi } from "@/lib/auth";
import { getSelectorCreateUrl } from "@/lib/config";
import {
  ContentMessageType,
  PopupMessageType,
  type BackgroundMessagingClient,
} from "@/lib/messaging";
import { appendSelectorHistory } from "@/lib/state";
import type {
  BrowserResultRecord,
  FinalSelectorResult,
  SelectorCreateResponse,
  SelectorHistoryEntry,
  SelectorCreateState,
  SelectorState,
  SelectorStatus,
} from "@/lib/state";

export interface AgentLoopDeps {
  state: SelectorState;
  backgroundMessagingClient: BackgroundMessagingClient;
}

const MAX_BACKEND_STEPS = 20;

export type AgentLoopStatus =
  | Extract<SelectorStatus, "running" | "awaiting_browser">
  | "idle";

export class AgentLoopController {
  private status: AgentLoopStatus = "idle";
  private abortController: AbortController | null = null;

  constructor(private readonly deps: AgentLoopDeps) {}

  getStatus(): AgentLoopStatus {
    return this.status;
  }

  async runAgentLoop(sessionId: string): Promise<void> {
    if (this.status !== "idle") {
      throw new Error(`AgentLoop already ${this.status}`);
    }
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.status = "running";
    let steps = 0;
    try {
      while (true) {
        if (signal.aborted) return;

        if (steps >= MAX_BACKEND_STEPS) {
          await this.settle(sessionId, {
            status: "error",
            note: `Exceeded max backend steps (${MAX_BACKEND_STEPS}).`,
          });
          return;
        }
        steps++;

        const response = await this.api(signal);
        this.deps.state.set(response.state);

        if (response.action.type === "done") {
          await this.settle(
            sessionId,
            response.state.finalResult ?? {
              status: "error",
              note: "No finalResult returned.",
            }
          );
          return;
        }

        if (response.action.type === "error") {
          await this.settle(sessionId, {
            status: "error",
            note:
              response.state.errors?.[0]?.message ?? "Backend reported error.",
          });
          return;
        }

        if (response.action.type === "test_selectors") {
          this.status = "awaiting_browser";
          const requestId = response.action.requestId;
          const browserRequest = response.state.browserRequest;
          if (!browserRequest || browserRequest.id !== requestId) {
            throw new Error(`No browser request found for ${requestId}`);
          }

          const tabId = this.deps.state.getMeta()?.tabId ?? null;
          if (tabId == null) {
            throw new Error("No active tab for TestSelectors dispatch");
          }

          const { selectorResults, elementHtmlById } =
            await this.deps.backgroundMessagingClient.sendMessageToContent(
              tabId,
              ContentMessageType.TestSelectors,
              {
                sessionId,
                requestId: browserRequest.id,
                selectors: browserRequest.selectors,
                needHtmlForFeedback: browserRequest.needHtmlForFeedback,
              }
            );

          const browserResult: BrowserResultRecord = {
            requestId: browserRequest.id,
            completedAt: new Date().toISOString(),
            selectorResults,
            elementHtmlById,
          };
          this.deps.state.update((prev) => ({
            ...prev,
            browserResult,
          }));

          this.status = "running";
          continue;
        }
      }
    } catch (error) {
      if (signal.aborted) {
        this.status = "idle";
        return;
      }
      console.error("[selector-extension] AgentLoop error", error);
      await this.settle(sessionId, {
        status: "error",
        note: error instanceof Error ? error.message : "Unknown loop error",
      });
    } finally {
      this.abortController = null;
    }
  }

  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.status = "idle";

    if (this.deps.state.get()) {
      this.deps.state.update((prev) => ({
        ...prev,
        browserRequest: null,
      }));
    }
  }

  async settleWithError(sessionId: string, note: string): Promise<void> {
    this.abortController?.abort();
    this.abortController = null;
    await this.settle(sessionId, { status: "error", note });
  }

  private async settle(
    sessionId: string,
    result: FinalSelectorResult
  ): Promise<void> {
    this.status = "idle";

    const session = this.deps.state.get();
    if (session) {
      this.deps.state.update((prev) => ({
        ...prev,
        status: result.status === "error" ? "error" : "done",
        finalResult: result,
        browserRequest: null,
      }));
    }

    // On success, capture the settled selector into durable history. `css` is
    // the agent's best generated selector; `xpath` is seeded from the picked
    // element (`targets[].elementXpath`) unless the best selector is itself an
    // xpath.
    let historyEntry: SelectorHistoryEntry | undefined;
    if (session && result.status !== "error" && result.bestSelector) {
      const best = result.bestSelector;
      const seededXpath = session.targets.find(
        (t) => t.elementXpath
      )?.elementXpath;
      const entry: SelectorHistoryEntry = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        url: session.page.url,
        mode: session.mode,
        css: best.type === "css" ? best.value : undefined,
        xpath: best.type === "xpath" ? best.value : seededXpath,
        langsmithRunId: result.langsmithRunId,
      };
      if (entry.css || entry.xpath) {
        try {
          await appendSelectorHistory(entry);
          historyEntry = entry;
        } catch (error) {
          console.debug("[selector-extension] history append failed", error);
        }
      }
    }

    const tabId = this.deps.state.getMeta()?.tabId ?? null;
    if (tabId != null) {
      try {
        await this.deps.backgroundMessagingClient.sendMessageToContent(
          tabId,
          ContentMessageType.DeactivatePicker,
          { sessionId }
        );
      } catch {
        // content script may already be gone
      }
    }
    await this.deps.backgroundMessagingClient.sendMessageToPopup(
      PopupMessageType.SelectorGenerationSettled,
      { sessionId, result, historyEntry }
    );
    // Auto-reopen the popup so the user sees the result without an extra
    // click. Browser may reject if no recent user gesture / unsupported
    // version — render-on-bootstrap is the resilient path; this is best
    // effort.
    try {
      await browser.action.openPopup();
    } catch (error) {
      console.debug("[selector-extension] openPopup not allowed", error);
    }
  }

  /** One agent turn: POST current state -> backend, return parsed response. */
  private async api(signal: AbortSignal): Promise<SelectorCreateResponse> {
    const state = this.deps.state.get();
    if (!state) throw new Error("No state in singleton to step");

    const url = await getSelectorCreateUrl();

    const res = await this.postState(url, state, signal);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Selector-create POST failed: ${res.status} ${
          res.statusText
        } ${text.slice(0, 200)}`
      );
    }

    return (await res.json()) as SelectorCreateResponse;
  }

  /** POST the session state to the backend with the active auth method applied. */
  private async postState(
    url: string,
    state: SelectorCreateState,
    signal: AbortSignal
  ): Promise<Response> {
    return fetchIntunedApi(url, {
      method: "POST",
      body: JSON.stringify(state),
      signal,
    });
  }
}
