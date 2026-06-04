import { sendMessage } from "../../lib/messaging/messages";
import type { AuthIdentity, AuthMethod, AuthState } from "../../lib/auth";

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

/** Pick buttons are enabled only when signed in ("multiple" stays disabled). */
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

  // session has a name/picture; api-key/token only have email + workspace
  const displayName = identity?.name ?? identity?.nickname;
  el("user-name").textContent = displayName ?? identity?.email ?? "Signed in";
  // don't repeat the email when it's already the name line
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

  // A configured method that failed (bad API key, expired token): show why.
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
  el("signin").hidden = false; // keep a way to retry
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

async function checkAuth(): Promise<void> {
  setChip("unknown", "…");
  try {
    const state = await sendMessage("initializeAuth");
    if (state.authenticated && state.method) renderAuthed(state.method, state.identity);
    else renderSignedOut(state);
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
    const state = await sendMessage("setApiKey", { apiKey, workspaceId });
    el<HTMLInputElement>("api-key-input").value = "";
    if (state.authenticated && state.method) renderAuthed(state.method, state.identity);
    else renderSignedOut(state);
  } catch (error) {
    showApiKeyError(error instanceof Error ? error.message : "Could not save API key.");
  } finally {
    button.disabled = false;
    button.textContent = "Save API key";
  }
}

function wireControls(): void {
  el<HTMLButtonElement>("signin-btn").addEventListener("click", () => {
    void sendMessage("signIn");
  });
  el<HTMLButtonElement>("signin-retry").addEventListener("click", () => {
    void checkAuth();
  });
  el<HTMLButtonElement>("api-key-save").addEventListener("click", () => {
    void saveApiKey();
  });
  el<HTMLButtonElement>("sign-out").addEventListener("click", async () => {
    const state = await sendMessage("signOut");
    if (state.authenticated && state.method) renderAuthed(state.method, state.identity);
    else renderSignedOut(state);
  });
}

// The popup reloads on every open, so this runs each time its UI appears.
wireControls();
void checkAuth();
