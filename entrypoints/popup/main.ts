import type { FinalSelectorResult, SelectorCreateState } from "@/lib/state";
import type { AuthIdentity, AuthMethod, AuthState } from "@/lib/auth";
import {
  BackgroundMessageType,
  PopupMessageType,
  createPopupMessagingClient,
} from "@/lib/messaging";

const messagingClient = createPopupMessagingClient();

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id} in popup`);
  return node as T;
}

type ChipState = "unknown" | "authenticated" | "unauthenticated" | "error";

const METHOD_LABEL: Record<AuthMethod, string> = {
  token: "Token",
  "api-key": "API key",
  session: "Browser",
};

function setChip(state: ChipState, label: string): void {
  const chip = el<HTMLSpanElement>("auth-state");
  chip.dataset.state = state;
  chip.textContent = label;
}

function setModesEnabled(enabled: boolean): void {
  for (const id of ["pick-single", "pick-list"]) {
    el<HTMLButtonElement>(id).disabled = !enabled;
  }
}

function renderAuthed(method: AuthMethod, identity: AuthIdentity | null): void {
  el("signin").hidden = true;
  el("user-info").hidden = false;

  const avatar = el<HTMLImageElement>("user-avatar");
  avatar.hidden = !identity?.picture;
  if (identity?.picture) avatar.src = identity.picture;

  const displayName = identity?.name ?? identity?.nickname;
  el("user-name").textContent = displayName ?? identity?.email ?? "Signed in";
  el("user-email").textContent = displayName
    ? identity?.email ?? identity?.workspaceId ?? ""
    : identity?.workspaceId ?? "";

  el("user-method").textContent = METHOD_LABEL[method];
  setChip("authenticated", "Signed in");
  setModesEnabled(true);
  el("status").textContent = "No selection yet.";
}

function renderSignedOut(state?: AuthState): void {
  el("user-info").hidden = true;
  el("signin").hidden = false;
  setChip("unauthenticated", "Signed out");
  setModesEnabled(false);

  if (state?.error) {
    el("status").textContent = state.error;
    if (state.method === "api-key") {
      showApiKeyError(state.error);
      el<HTMLDetailsElement>("apikey-details").open = true;
    }
  } else {
    el("status").textContent = "Sign in to get started.";
  }
}

function renderError(message: string): void {
  el("user-info").hidden = true;
  el("signin").hidden = false;
  el("status").textContent = message;
  setChip("error", "Error");
  setModesEnabled(false);
}

function showApiKeyError(message: string): void {
  const node = el<HTMLParagraphElement>("api-key-error");
  node.textContent = message;
  node.hidden = false;
}

function clearApiKeyError(): void {
  const node = el<HTMLParagraphElement>("api-key-error");
  node.textContent = "";
  node.hidden = true;
}

function applyAuthState(state: AuthState): void {
  if (state.authenticated && state.method)
    renderAuthed(state.method, state.identity);
  else renderSignedOut(state);
}

function renderFinalResult(result: FinalSelectorResult): void {
  const results = el<HTMLElement>("results");
  results.replaceChildren();

  if (
    (result.status === "ok" || result.status === "fallback") &&
    result.bestSelector
  ) {
    const { type, value } = result.bestSelector;
    el("status").textContent =
      result.status === "fallback" ? "Fallback selector" : "Selector ready";

    const row = document.createElement("div");
    row.className = "result-row";

    const code = document.createElement("code");
    code.className = "result-code";
    code.textContent = value;
    code.title = `${type}: ${value}`;

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "result-copy";
    copy.textContent = "Copy";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(value);
        const original = copy.textContent;
        copy.textContent = "Copied";
        copy.disabled = true;
        setTimeout(() => {
          copy.textContent = original;
          copy.disabled = false;
        }, 1200);
      } catch {
        copy.textContent = "Copy failed";
        setTimeout(() => (copy.textContent = "Copy"), 1200);
      }
    });

    row.append(code, copy);
    results.append(row);
  } else {
    el("status").textContent = result.note ?? "Could not generate selector.";
  }
}

function renderSessionSnapshot(session: SelectorCreateState | null): void {
  if (!session) return;
  if (session.finalResult) {
    renderFinalResult(session.finalResult);
    return;
  }
  if (session.status === "picking") {
    el("status").textContent = "Pick an element on the page.";
    return;
  }
  if (session.status === "running" || session.status === "awaiting_browser") {
    el("status").textContent = "Generating selector…";
  }
}

async function bootstrap(): Promise<void> {
  setChip("unknown", "…");
  try {
    const snapshot = await messagingClient.sendMessageToBackground(
      BackgroundMessageType.BootstrapPopup,
      undefined as never
    );
    applyAuthState(snapshot.auth);
    renderSessionSnapshot(snapshot.session);
  } catch {
    renderError("Couldn’t reach Intuned. Check your connection and retry.");
  }
}

async function saveApiKey(): Promise<void> {
  clearApiKeyError();
  const apiKey = el<HTMLInputElement>("api-key-input").value.trim();
  const workspaceId = el<HTMLInputElement>("workspace-id-input").value.trim();
  if (!apiKey || !workspaceId) {
    showApiKeyError("Enter both an API key and a workspace ID.");
    return;
  }

  const button = el<HTMLButtonElement>("api-key-save");
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    const state = await messagingClient.sendMessageToBackground(
      BackgroundMessageType.SetApiKey,
      {
        apiKey,
        workspaceId,
      }
    );
    el<HTMLInputElement>("api-key-input").value = "";
    applyAuthState(state);
  } catch (error) {
    showApiKeyError(
      error instanceof Error ? error.message : "Could not save API key."
    );
  } finally {
    button.disabled = false;
    button.textContent = "Save API key";
  }
}

async function startSession(mode: "single" | "list"): Promise<void> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab?.url) {
    el("status").textContent = "No active tab to attach to.";
    return;
  }
  const url = new URL(tab.url);
  try {
    await messagingClient.sendMessageToBackground(
      BackgroundMessageType.StartPickerSession,
      {
        mode,
        page: {
          url: tab.url,
          origin: url.origin,
          title: tab.title,
          capturedAt: new Date().toISOString(),
        },
      }
    );
    window.close();
  } catch (error) {
    el("status").textContent =
      error instanceof Error ? error.message : "Could not start session.";
  }
}

function wireControls(): void {
  el<HTMLButtonElement>("signin-btn").addEventListener("click", () => {
    void messagingClient.sendMessageToBackground(
      BackgroundMessageType.SignIn,
      undefined as never
    );
  });
  el<HTMLButtonElement>("signin-retry").addEventListener("click", () => {
    void bootstrap();
  });
  el<HTMLButtonElement>("api-key-save").addEventListener("click", () => {
    void saveApiKey();
  });
  el<HTMLButtonElement>("sign-out").addEventListener("click", async () => {
    const state = await messagingClient.sendMessageToBackground(
      BackgroundMessageType.SignOut,
      undefined as never
    );
    applyAuthState(state);
  });

  el<HTMLButtonElement>("pick-single").addEventListener("click", () => {
    void startSession("single");
  });
  el<HTMLButtonElement>("pick-list").addEventListener("click", () => {
    void startSession("list");
  });

  // BG-pushed events: re-render when the active session changes or settles.
  // Renderers TODO; subscribe is wired so future code only adds the UI side.
  messagingClient.onEvent(PopupMessageType.SessionStateChanged, () => {
    /* TODO: render in-flight session */
  });
  messagingClient.onEvent(
    PopupMessageType.SelectorGenerationSettled,
    ({ sessionId, result }) => {
      console.log("[selector-extension] settled", { sessionId, result });
      renderFinalResult(result);
    }
  );
}

wireControls();
void bootstrap();
