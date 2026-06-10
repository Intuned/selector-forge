# Popup → React Migration Scaffold

Migrate `entrypoints/popup/` from vanilla TS+HTML to React, behavior 1:1, no UX changes.

Decisions (already settled):

- **Scope:** Single `App` component (no AuthPanel/ModesPanel/ResultsPanel split yet).
- **Styling:** CSS Modules — `style.css` → `style.module.css`.
- **WXT integration:** `@wxt-dev/module-react` (official module).

---

## 1. Dependencies

In `apps/selector-extension/package.json`:

- `dependencies`: add
  - `react`
  - `react-dom`
- `devDependencies`: add
  - `@wxt-dev/module-react`
  - `@types/react`
  - `@types/react-dom`

Then `yarn install` from `apps/selector-extension/`.

Pin to versions compatible with the installed WXT (`^0.20.0`). React 18 is the safe target; do not jump to 19 unless WXT's module README explicitly supports it.

---

## 2. WXT config

`apps/selector-extension/wxt.config.ts`:

```ts
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // …existing manifest + dev config unchanged…
});
```

`postinstall` already runs `wxt prepare`, which will regenerate `.wxt/tsconfig.json` with the right JSX settings. No manual `tsconfig.json` change needed — the existing `"extends": "./.wxt/tsconfig.json"` picks it up.

---

## 3. File changes under `entrypoints/popup/`

End state:

```
entrypoints/popup/
├─ index.html
├─ main.tsx               # was main.ts — mounts <App /> into #root
├─ App.tsx                # NEW — all current popup logic
└─ style.module.css       # was style.css — CSS Modules
```

### 3a. `index.html`

- Replace the static markup block (`<header>…<section id="results">`) with a single mount point: `<div id="root"></div>`.
- Change the script tag from `./main.ts` to `./main.tsx`.
- Drop the `<link rel="stylesheet" href="./style.css" />` line — `App.tsx` will import the CSS module instead.
- Keep `<title>` and viewport meta as-is.

### 3b. `main.tsx`

Minimal entry — create root, render `<App />`. No logic here.

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./App";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root in popup");
createRoot(container).render(<App />);
```

### 3c. `App.tsx`

Single component owning the same behavior `main.ts` has today. Reuses every import from `@/lib/messaging`, `@/lib/state`, `@/lib/auth` — no changes to those layers.

State shape (all `useState`):

- `authState: AuthState | null`
- `chip: { state: ChipState; label: string }`
- `statusText: string`
- `finalResult: FinalSelectorResult | null`
- `apiKeyError: string | null`
- `apiKeyOpen: boolean` (controls the `<details>` replacement)
- `apiKeySaving: boolean`
- `apiKeyInput: string`
- `workspaceIdInput: string`
- `copied: boolean` (for the Copy → Copied → Copy transition)
- `bootstrapError: string | null` (drives the "Couldn't reach Intuned" branch)

Effects:

- `useEffect(() => { void bootstrap(); }, [])` — calls `BootstrapPopup`, applies snapshot.
- `useEffect(() => { return messagingClient.onEvent(SessionStateChanged, …) }, [])` — same TODO comment as today.
- `useEffect(() => { return messagingClient.onEvent(SelectorGenerationSettled, …) }, [])` — sets `finalResult` + `statusText`.

Handlers (in-component, replace the current top-level functions):

- `applyAuthState(state)` — splits into `setAuthState` + derived chip/status via render.
- `saveApiKey()` — same logic, `await … SetApiKey`, on error sets `apiKeyError` + leaves `<details>` open.
- `startSession("single" | "list")` — same `browser.tabs.query` + `StartPickerSession` + `window.close()`.
- `signIn()`, `signOut()`, `retryBootstrap()` — thin wrappers around `messagingClient.sendMessageToBackground`.
- Copy button — local `useState<boolean>` for "Copied", `setTimeout` cleared on unmount.

Render structure mirrors current `index.html` 1:1, but with `className={styles.xxx}`:

- `<header>` with `<h1>` + auth chip (`data-state` still set so the existing selector logic / e2e holds).
- Conditional `user-info` block when authenticated.
- Conditional `signin` block when signed out / error; the API key `<details>` becomes a controlled `<details open={apiKeyOpen}>` so we can force-open on auth error (mirrors `el<HTMLDetailsElement>("apikey-details").open = true`).
- `modes` section with three buttons; `disabled` driven by `authState?.authenticated`.
- `<p class={styles.status}>` for `statusText`.
- `<section class={styles.results} aria-live="polite">` rendering the single result row when `finalResult` is "ok" or "fallback".

Behavior parity checklist (keep these exact strings / semantics):

- Initial chip: `"…"` with `data-state="unknown"`.
- `METHOD_LABEL` map preserved verbatim.
- "Sign in to get started." / "Sign in to use Intuned Selector." copy unchanged.
- Status copy unchanged: "No selection yet." / "Pick an element on the page." / "Generating selector…" / "Selector ready" / "Fallback selector" / "Could not generate selector." / "Couldn't reach Intuned. Check your connection and retry."
- Copy button: `Copy` → `Copied` (disabled for 1200ms) → `Copy`. On clipboard failure: `Copy failed` → `Copy` after 1200ms.
- `code.title = `${type}: ${value}`` preserved.
- On bootstrap throw: render the error branch, chip = `"Error"` `data-state="error"`.

### 3d. `style.module.css`

- Rename the file; no rule changes needed in this scaffold pass.
- `:root` block stays at file top — CSS Modules leave `:root` unscoped, so the CSS variables continue to work globally.
- Element selectors (`body`, `*`, `header`, `h1`) stay unscoped too — CSS Modules only hash class selectors.
- Class selectors get hashed automatically. In `App.tsx`, import as `import styles from "./style.module.css"` and replace every `class="foo-bar"` with `className={styles.fooBar}` (kebab → camel).
- The `[data-state="…"]` attribute selectors on `.auth-chip` need to remain co-located with the `.auth-chip` class, which CSS Modules handles fine — keep them as written.

---

## 4. Things to NOT change

- `lib/**` — no changes. The popup is the only React surface in this pass.
- `entrypoints/background.ts`, `entrypoints/content.ts` — unchanged.
- `lib/messaging/popupMessenger.ts` and the `createPopupMessagingClient()` API — reused as-is.
- Tests under `tests/` — none of them target the popup DOM today, so no test churn expected. Verify with a grep for `popup/main` / `pick-single` / `auth-state` before merging; update only if matches show up.
- e2e (`e2e/`) — if any Playwright test queries by id (`#pick-single`, `#auth-state`, etc.), keep those id attributes on the React elements so the selectors keep working. Confirm with a grep before deleting any id.

---

## 5. Verification steps

1. `yarn compile` — must pass (the `.wxt/tsconfig.json` regen after `wxt prepare` is what enables JSX).
2. `yarn test` — existing vitest suite must stay green.
3. `yarn dev` — load the unpacked extension, open the popup, walk the full flow:
   - Signed-out state renders, chip says "Signed out".
   - API-key path: bad input → inline error + `<details>` stays open.
   - Sign-in path: chip flips to "Signed in", user info renders, modes enabled.
   - Start single → popup closes, picker activates.
   - Settle → reopen popup → Copy button cycles `Copy → Copied → Copy`.
   - Force a network failure on bootstrap → "Couldn't reach Intuned…" branch + retry works.
4. `yarn e2e` — if id selectors were preserved, should pass without edits.

---

## 6. Out of scope for this PR

- Splitting `App.tsx` into AuthPanel / ModesPanel / ResultsPanel — follow-up once the React surface is settled.
- Any redesign / visual changes.
- Migrating content-script overlay UI to React (separate, larger effort — that one runs inside the host page).
- State management library (Redux/Zustand/etc.) — `useState` + the existing BG-owned state singleton is sufficient.
