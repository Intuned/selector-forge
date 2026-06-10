# Selector Extension — Manual Test Plan & Edge Case Catalog

Companion to the automated test suite. Catalogs the edge cases that are too contextual, slow, or environment-specific to assert in CI: real-page weirdness, browser quirks, MV3 service-worker behavior, AI/backend race conditions, accessibility, privacy, and packaging.

Read this **before** any release. Cherry-pick what's plausible for the change set; do a fuller pass before a tagged release.

Tags used in this doc:
- 🔴 **must verify** — known to be a problem we've hit or anticipate hitting; don't ship without checking.
- 🟡 **likely a problem** — plausible failure mode we haven't validated.
- 🟢 **defensive check** — would be a surprise if broken, worth a quick smoke.
- ⚠️ **known limitation** — documented behavior we accept today.

---

## 1. Pages the extension might land on

The picker has to behave on *any* live page. Test against representative samples from each class — each one is a different bug shape.

### Page kinds

- 🔴 **`<all_urls>` injection** — picker should work on a vanilla blog, on `gmail.com`, on `notion.so`, on `github.com`.
- 🔴 **Single-page apps (SPA)** — Gmail, Notion, Linear, GitHub. Route changes mid-pick should not crash the overlay. After a virtual nav, picker overlay state should reset on next session.
- 🟡 **Infinite scroll** — Twitter/X, Reddit. Picking an item that's then scrolled out of view; overlay's `currentHover` referencing a detached node. Verify `handleViewportChange` doesn't blow up on disconnected nodes.
- 🟡 **Virtual scrolling** — long lists where DOM nodes are recycled (Linear board, React-virtualized tables). The picked element may be unmounted before submit. Verify `element.isConnected` guards hold.
- 🟡 **Lazy-loaded content** — pick an `<img loading="lazy">` before vs. after it enters viewport.
- 🔴 **Sites with strict CSP** — GitHub, banking sites. Content script must inject; shadow-DOM `<style>` must not be blocked. (Shadow-DOM `<style>` bypasses page CSP, but verify.)
- 🟡 **Sites with `frame-ancestors 'none'`** — extension iframe injection is not at play (we don't inject iframes), but verify no console warnings.
- 🟡 **`<iframe>`-heavy sites** — Salesforce, old admin panels. Picker overlay lives in the top frame only — picking inside an iframe is not supported. Verify graceful behavior (the iframe contents are not selectable; user gets a sensible state, not a crash).
- ⚠️ **Cross-origin iframes** — picker can't reach into them at all. Known limitation; verify status text doesn't lie about it.
- 🔴 **PDF viewer** — `chrome://pdf-viewer` / built-in PDF reader. Should be a clean no-op (no overlay, helpful message).
- 🔴 **`chrome://` pages** — `chrome://extensions`, `chrome://settings`. Extensions can't inject. Verify status "Couldn't attach to this page" or similar; not a silent failure.
- 🟡 **`view-source:` pages** — verify pick is disabled or no-ops gracefully.
- 🟡 **`about:blank`** — newly-opened blank tab.
- 🟡 **`file://` URLs** — local HTML files. Disabled by default in Chrome (user must opt in per-extension); verify with both states.
- 🟡 **Browser native UI** — new tab page, downloads page, history page.
- 🟢 **Tab loaded inside a popup window** — `window.open('...', '', 'popup')`. Picker should still work in that window.
- 🟡 **Tab not yet finished loading** — start a pick before `DOMContentLoaded`. Content script runs at `document_idle` per manifest — verify the picker isn't lost in the gap.

### DOM quirks

- 🔴 **Shadow DOM (open)** — picking elements inside a web component's open shadow tree. Hover and click work via `event.composedPath()`; verify `e.target` returns the host (it does — that's how Chrome retargets) and that we don't accidentally pick the host instead of the shadow content.
- ⚠️ **Shadow DOM (closed)** — events cannot reach inside; picking elements in a closed shadow root is impossible. Document.
- 🟡 **Custom elements (web components)** — picking a `<my-button>` should produce a selector that targets the custom tag.
- 🔴 **Sticky / fixed headers with high z-index** — overlay toolbar uses `z-index: 2147483647`. Verify no page element overlays it.
- 🟡 **CSS transforms on ancestors** — `transform: translate` affects `getBoundingClientRect` interpretation. Hover box should still align.
- 🟡 **CSS `zoom`** — older sites. Hover box may be misaligned.
- 🟡 **Browser zoom in/out** — `Ctrl +` / `Ctrl -`. Hover box should follow the zoomed coordinates.
- 🟡 **Sub-pixel layout** — Retina, fractional `getBoundingClientRect` values. Hover box should not flicker on hover.
- 🟡 **`pointer-events: none` parent** — the element under the cursor returned by `e.target` is the next paint layer, not the visually-correct element. Document.
- 🟡 **`pointer-events: none` on the element itself** — cannot be picked. Document.
- 🟡 **`<area>` map regions** — verify the overlay treats the `<img usemap>` itself as the click target, not the map.
- 🟡 **Elements with `display: contents`** — picker hovers over a node that has no box. Verify the hover box doesn't show garbage dimensions.
- 🟡 **Reverse-DOM-order positioning** (flex `order`, grid `order`) — verify pick order in list mode reflects DOM order, not visual order, so the resulting selector is deterministic.
- 🟢 **SVG children** — pick a `<path>` inside an `<svg>`. The generated selector / xpath should resolve back.
- ⚠️ **Canvas content** — opaque to the DOM. Picking the `<canvas>` itself is fine; "the bar in this chart" isn't reachable.
- 🟡 **`<select>` open dropdown** — native dropdowns are rendered in browser chrome, not the page DOM. Picker can't reach them.
- 🟡 **Modals / overlays already on the page** — picking inside a `<dialog>`. Verify clicks aren't swallowed by the page's own backdrop dismiss-on-click-outside handler before the picker intercepts.
- 🟡 **Tooltips that disappear on hover-out** — user can't physically pick them. Document.
- 🟡 **Drag handles, draggable elements** — `mousedown` initiates drag in some apps. We `preventDefault` on mousedown, but verify no native drag image appears.

---

## 2. Picker overlay edge cases

### Hover / click

- 🔴 **Click on the toolbar itself** — `isOnOwnUI` check via `composedPath`. Toolbar buttons should fire their handlers; the page click handler should not.
- 🔴 **Click on a `<button onclick>` in the page** — must not fire the page handler. Tested in Layer 2; spot-check live.
- 🔴 **Click on `<a href>`** — must not navigate. Tested; spot-check live.
- 🟡 **Click on a form submit button** — must not submit the form.
- 🟡 **Click on a `<label for>`** — should not toggle the linked input.
- 🟡 **Right-click** — overlay does not handle `contextmenu`. The page's right-click menu still opens. Pick is not registered. Verify this is acceptable (probably is — right-click as pick would conflict with browser context menus).
- 🟡 **Middle-click** — opens link in new tab? Our mousedown handler should suppress.
- 🟡 **Cmd/Ctrl-click** — opens link in new tab. Same.
- 🟡 **Double-click** — first click commits in single mode; second click is on the locked overlay (no-op). In list mode, second click would toggle off. Verify.
- 🟡 **Long-press (touch)** — opens context menu. Same as right-click.
- 🟡 **Click outside any element** (e.g., scrollbar, body padding) — `e.target` may be `<html>` or `<body>`. The overlay accepts it; verify the produced selector isn't garbage.
- 🟡 **Hover over the toolbar itself** — hover box should hide.
- 🔴 **Hover over an element that re-renders between hover and click** — React/Vue components that re-render on hover (e.g., button changes appearance). The clicked element may be a different instance than the hovered one. Verify pick still works.

### Cursor override

- 🔴 **Custom cursors on the page** — our `* { cursor: default !important }` should beat them. Verify on a CodeMirror editor, on a custom drag-and-drop UI, on a game canvas.
- 🟡 **Toolbar's own cursors** — toolbar is in shadow DOM, so its CSS is not overridden. Verify the `move` cursor on the drag handle still works.
- 🟢 **Cursor restored after unmount** — open picker, cancel, verify page cursors return.

### Toolbar drag

- 🟡 **Drag to off-screen** — toolbar can be dragged off the viewport with no way to recover until session ends.
- 🟡 **Drag onto the address bar / browser chrome** — should clamp to viewport.
- 🟡 **Drag during a tab switch** — drag state stuck if mouseup happens outside the tab.
- 🟢 **Click drag handle then release without dragging** — should not commit a fake drag.

### Keyboard

- 🔴 **Esc on a page that handles Esc** — Gmail, Notion, GitHub all bind Esc. Our `keydown` listener is in capture phase with `stopPropagation`, so the page should NOT see Esc. Verify on real apps.
- 🔴 **Enter in a text input** — if user happens to be focused on a text input when starting the picker and they hit Enter (list mode). The input may submit its form. Verify.
- 🟡 **Tab navigation** — Tab cycles focus. While the picker is active, focus shouldn't matter, but ARIA / screen reader expectations may need a focus trap on the toolbar.
- 🟡 **Browser shortcuts** — `Ctrl+T`, `Ctrl+W`, `Ctrl+Tab`, `F5`. These reach the browser before our listener. F5/reload will discard the session — verify cleanup runs (it doesn't — the unload happens too fast for us to clean up the content script; the BG session state remains stale).
- 🟡 **`Ctrl+F` (find on page)** — opens browser find bar. Picker stays active; find bar steals focus. Esc closes the find bar, not the picker. Verify which one Esc lands on.
- 🟡 **Sticky modifier keys** (Caps Lock, accessibility shortcuts) — verify no unexpected pick.
- 🟢 **Enter in single mode** — should be a no-op (no Done button).
- 🟢 **Enter in list mode with zero picks** — Done button disabled; Enter handler also has the `picked.length > 0` guard. Verify.

### Viewport changes

- 🟡 **Scroll** — `handleViewportChange` re-renders selected highlights. Verify boxes stay aligned through smooth scroll, momentum scroll, and programmatic scroll.
- 🟡 **Resize during pick** — toolbar position may go off-screen; selected highlights should still align.
- 🟡 **Open DevTools** — splits the viewport. Verify hover/selected boxes track.
- 🟡 **Mobile emulation / responsive design mode** — DevTools' device mode.
- 🟡 **Print preview** — picker overlay may print; verify it doesn't.
- 🟡 **Fullscreen API** — page enters fullscreen mid-pick (some video sites do this on click). Picker should probably cancel or pause.
- 🟡 **Picture-in-picture** — verify no surprise behavior.

### Selected element disappears

- 🔴 **Element removed from DOM between pick and submit** — e.g., a tooltip that auto-dismisses on click. The overlay holds a reference in `picked[]`. `renderSelected` checks `isConnected`. Verify the resulting selector is still attempted or that we surface a clean error.
- 🟡 **Element re-rendered (replaced in DOM) between pick and submit** — React reconciliation. The reference is stale. Verify backend either matches the new instance or surfaces a clear failure.
- 🟡 **Page navigation between pick and submit** — overlay should cancel; verify BG session is also torn down (and a stale `SessionStateChanged` doesn't get sent to popup).

---

## 3. Mode-specific edge cases

### Single mode

- 🔴 **Click the `<body>`** — picks the entire body. Selector quality is suspect; verify backend returns something usable or a fallback.
- 🟢 **Click the `<html>`** — extreme edge; verify no crash.
- 🟡 **Click on the overlay's own toolbar by accident** — should not pick.

### List mode

- 🔴 **Toggle same element on/off rapidly** — verify final picked set is deterministic.
- 🔴 **Pick elements with wildly different structures** — e.g., a heading and a button. Backend should handle or fallback. Verify UI doesn't break.
- 🟡 **Pick > 50 elements** — performance: does each click cause O(N²) work in `renderSelected`?
- 🟡 **Pick a parent then its child** — produces an overlapping selection. Selector quality TBD; UI should still render highlights without flicker.
- 🟢 **Done button click then immediate click on page** — overlay locks, second click no-op.
- 🟡 **All picked elements have the same id** (`id="x"` on multiple elements — invalid HTML but happens). Verify the registry assigns distinct ids and the backend isn't confused.

### Multiple mode (currently disabled)

- ⚠️ **Multiple mode button enabled by accident** — currently `disabled` in HTML. Verify CSS / JS doesn't accidentally enable it. Tests should fail loudly if anyone wires it up without a real implementation.

---

## 4. Auth & sign-in edge cases

### API key entry

- 🔴 **Leading / trailing whitespace** in the key field — `setApiKeyCredentials` trims. Verify the UI doesn't show "Saved" when the trimmed key is empty.
- 🔴 **Pasted with newline** (copying from a code block). Trim should strip.
- 🟡 **Key starting with wrong prefix** (`sk_` instead of `in1_`). No client-side validation; backend rejects. Verify the inline error message is the backend's, not "Save API key" stuck in `Saving…`.
- 🟡 **Workspace ID is not a UUID** — backend rejects with 400. Verify error path.
- 🟡 **Key + workspace from different workspaces** — backend rejects. Verify message.
- 🟢 **Unicode / emoji in API key field** — UI shouldn't crash; backend rejects.
- 🟡 **Very long key (10k chars)** — paste a giant blob. UI shouldn't hang.
- 🔴 **Password manager autofill** — verify the API key field accepts autofill and doesn't get pre-filled with the wrong credential.

### Sign-in flow

- 🔴 **Sign-in tab closed before completion** — popup shows "I've signed in — retry" button. Click retries `initAuth`. Verify it doesn't get stuck.
- 🟡 **Network fails during `/api/auth/session` exchange** — popup shows network error message.
- 🟡 **`/api/auth/me` succeeds but `/api/auth/session` returns no token** — already covered by tests; verify the inline message is sensible.
- 🟡 **3rd-party cookies blocked** — `dev.intuned.io` session cookie may not be sent from the SW. Verify expected behavior.
- 🟡 **Browser session expired between popup open and clicking Sign Out** — sign-out triggers `initAuth` which re-probes session. Verify no infinite loop.
- 🟡 **Multiple browser profiles** — sign-in in profile A, switch to profile B; storage is per-profile.
- 🟡 **Incognito / private window** — extension may not be enabled (user toggle). Verify popup behavior when extension is disabled in incognito.

### Token expiry mid-session

- 🔴 **Token expires during agent loop** — the loop's `fetch` to `SELECTOR_CREATE_URL` may 401 mid-loop. Today the loop treats non-2xx as terminal error. Verify error message tells the user to sign in again.
- 🟡 **Token expires between popup open and clicking Single** — popup looks signed in; first BG request fails. Verify gracefully.
- 🟡 **API key bearer expires mid-loop** — provider auto-exchanges; verify the loop doesn't see a hiccup.
- 🟡 **Refresh token expired** — `refreshAccessToken` returns the same expired token or fails. Verify.

### Multi-account

- 🟡 **Sign out then sign in with a different account** — verify all prior credentials wiped (the cleanup tests cover this, but spot-check live).
- 🟡 **Multiple devices** — we use `chrome.storage.local`, not `sync`. Tokens stay local. Document.

---

## 5. Agent loop & backend AI edge cases

The loop's branch table is covered by unit tests (Layer 3). These are the **production-only** failure modes.

### Backend slowness

- 🔴 **Agent takes 30s+ per turn** — popup shows "Generating selector…". Verify it doesn't time out the SW (MV3 idle timeout is 30s wall-clock; SW may suspend mid-fetch). Verify the fetch survives and the loop resumes.
- 🔴 **Agent takes 90s+ total** — service worker idle timeout. The `fetch` extends the SW lifetime in Chromium, but verify experimentally.
- 🟡 **Agent never returns `done`** — many test_selectors rounds. No client-side iteration limit today. ⚠️ **Add one.** Verify behavior under a 20-round backend bug.
- 🟡 **Agent returns `done` with no `finalResult`** — loop substitutes an error. Verify popup shows the error note.
- 🟡 **Agent returns `done` with `finalResult.status: "ok"` but no `bestSelector`** — popup falls back to error message. Verify.
- 🟡 **Agent returns selector that matches 0 elements** — when user picks it back via Copy, won't work. Verify backend tags it as `fallback` or `error`, not `ok`.
- 🟡 **Agent returns selector that matches the wrong elements** — quality regression, not a UI bug. Layer 4 sanity check: assert returned selector resolves to the picked element on the page.

### Backend errors

- 🟡 **Backend returns 500** — loop settles with error. Verify message exposes status code (it does — tested).
- 🟡 **Backend returns 401** — should signal re-auth. Today: surfaces the raw message. ⚠️ **Should re-route to sign-in UI.**
- 🟡 **Backend returns 429** — rate limit. Today: surfaces raw. ⚠️ **Should suggest waiting / show retry-after.**
- 🟡 **Backend returns 200 but JSON is malformed** — `await res.json()` throws. Caught as a generic error. Verify the popup gets a settled error, not a hang.
- 🟡 **Backend returns 200 + valid JSON + invalid schema** (e.g., missing `action`) — we don't validate on the wire today. ⚠️ **Add Zod parse at the boundary** (this is "Layer 1 — Schema contract tests" from the strategy doc we excluded).
- 🟡 **Backend returns a selector with unbalanced quotes** — the popup's Copy renders it as text. Verify Copy delivers the exact string to clipboard.
- 🟡 **Backend returns XPath in CSS field or vice versa** — selector won't resolve. Verify Copy still works.

### Race conditions

- 🔴 **Cancel mid-flight while `test_selectors` response is in-flight from content script** — the response arrives after cancel. State has been cleared. Verify no crash, no stale state mutation. (Tested partially in Layer 3 — verify live.)
- 🔴 **Start new session while old one is still settling** — `handleStartPickerSession` cancels the prior loop. If the prior loop's `settle()` is mid-`await`, verify the new session's state isn't overwritten.
- 🟡 **Backend response arrives after a tab close** — `state.update` is called on cleared state. Today `update()` throws. Verify it's caught.
- 🟡 **Two rapid pick clicks in single mode** — first commits; second is locked. Verify.
- 🟡 **Click Cancel in toolbar while backend is processing** — overlay disappears, BG should cancel the loop. The current `Cancel` button only calls `onCancel`, which triggers `handleCancelPickerSession`. Verify the agent loop is `cancel()`-ed.
- 🟡 **Browser tab discarded** (Chrome memory pressure) — CS dies. BG's next `toContent` rejects. Loop catches and settles with error. Verify popup gets the error event.

### Cross-origin / network

- 🟡 **CORS preflight to selector backend** — `OPTIONS` request. Backend must respond correctly.
- 🟡 **Backend on a different origin than auth** — extension uses both `dev.intuned.io` and `localhost:3000` today. Verify both `host_permissions` entries are present in built manifest.
- 🟡 **VPN / proxy changes mid-loop** — fetch may fail. Verify error handling.
- 🟡 **Browser offline mode** — initial check should disable modes? Today it doesn't. ⚠️ **Consider.**

---

## 6. MV3 service-worker quirks

The background is a service worker, not a persistent page. This class of bug only shows up in real Chromium.

- 🔴 **SW idle suspension** — Chrome suspends the SW after 30s of inactivity. Any in-memory state (`SelectorState`, `AgentLoopController.status`) is lost. Verify:
  - Pick → wait 60s with popup closed → settle: popup re-bootstrap shows the result.
  - Pick → wait 60s mid-loop with popup closed: the loop may or may not resume. Today nothing persists `messages[]` to storage. ⚠️ **Sessions may be lost across SW suspension.**
- 🔴 **SW restarts during pick** — same as suspension. Verify the content script's `PickerSession` survives or surfaces cleanly.
- 🟡 **SW first-boot latency** — on extension first load or after a long suspension, the first BG message may take 1-2s. Popup `bootstrapPopup` may feel slow. Verify no spinner-of-death.
- 🟡 **Two tabs pick simultaneously** — only one `SelectorState` instance in BG. Second `StartPickerSession` cancels the first. Verify the first tab's overlay is also unmounted (today: `agentLoopController.cancel()` runs but the first tab's overlay may persist until that tab gets a `DeactivatePicker`). 🟡 **May leak overlay in old tab.**
- 🟡 **SW updated mid-session** — new SW takes over after the old one's `await fetch` completes. State is lost. Verify no crash.
- 🟡 **`browser.action.openPopup()` rejects** — covered by tests; verify the rejected popup-open doesn't leave any state inconsistent.
- 🟡 **Content script not yet injected when `ActivatePicker` is sent** — manifest specifies `runAt: document_idle`. On a slow page the CS may not be ready. The `toContent` await would reject. Verify graceful behavior (today: throws → loop catches → settle with error).

---

## 7. Storage edge cases

- 🟡 **`chrome.storage.local` quota** (10 MB in MV3, was 5 MB in MV2). We store small auth blobs only; far from the limit. Verify a future "session history" feature plans for this.
- 🟡 **Storage value of unexpected type** (e.g., `auth.token` set to a number by a manual edit). `getString` returns null for non-strings — verify graceful behavior.
- 🟡 **Storage cleared while popup is open** — popup's auth state goes stale. Verify next user action re-reads.
- 🟡 **Storage cleared while agent loop is running** — token disappears. Next `fetch` may 401. Verify the user-facing error.
- 🟡 **Schema migration v1 → v2** — `SELECTOR_HISTORY_SCHEMA_VERSION` is 2. There's no migration code. If we ever wrote v1 data, today's code would just fail to parse. ⚠️ **No migration story for state schema.**
- 🟢 **Fresh install** — no stored credentials. Popup shows sign-in. Verify.
- 🟡 **Re-install** — extension reinstalled, storage may or may not be preserved depending on Chrome version. Verify popup recovers.

---

## 8. Popup UI edge cases

- 🔴 **Popup closes during agent loop** — settle fires `SelectorGenerationSettled`; with popup closed, the event listener is gone. The settle handler also tries `browser.action.openPopup()` — may fail (no recent gesture). The resilient path is bootstrap-on-open. Verify: pick → close popup → wait for settle → re-open popup → result is visible.
- 🔴 **Popup re-opened mid-loop** — `bootstrapPopup` returns `session` with `status: "running"`. Popup shows "Generating selector…". Verify.
- 🟡 **Popup opened, closed, re-opened rapidly** — multiple `bootstrapPopup` calls. Verify no race.
- 🟡 **`browser.action.openPopup()` rejection** — needs user gesture per Chrome spec. Verify the fallback (next manual open shows result) works.
- 🟡 **Popup resized** — popup is fixed-width per browser policy. Verify no horizontal scrollbar on standard widths.
- 🟡 **Popup with system zoom** (Windows scaling 125%, 150%) — verify no clipping.
- 🟡 **Popup on a small laptop screen** (vertical scroll triggered) — verify the Sign Out button is reachable.
- 🟡 **Browser dark mode** — popup CSS today is light-only. ⚠️ **Verify legibility in dark mode.**
- 🟡 **Browser high-contrast mode** (Windows accessibility) — verify focus rings and chip colors are visible.
- 🟡 **Result selector is very long** (200+ chars) — CSS overflow/ellipsis. Hover should reveal full value (the `title` attribute is set). Verify.
- 🟡 **Result selector contains `<`, `>`, `&`** — we use `textContent`, not `innerHTML`. Verify no HTML injection.
- 🟡 **Copy button on a browser without clipboard API** — old browsers, restricted contexts. We catch and show "Copy failed". Verify.
- 🟡 **Copy button after focus loss** — clipboard API requires document focus. Verify behavior when popup-as-tab loses focus.
- 🔴 **Identity fields missing** (no name, no email) — popup falls back through `name → nickname → email → workspaceId → "Signed in"`. Verify with a token that has only workspaceId.

---

## 9. Privacy & security

- 🔴 **Inspection view contains form values** — `cloneNode(true)` clones input elements but `value` is NOT cloned (DOM quirk; only `defaultValue`/`value` attribute clones). Verify the LLM doesn't see typed-in passwords or PII. **Worth a spot-check on a login form.**
- 🟡 **Inspection view contains `value` attribute** — pre-filled form fields. Long values are truncated to 200 chars; passwords often shorter. ⚠️ **Confirm and document.**
- 🟡 **`type="password"` fields** — picker can pick them. Backend sees the surrounding HTML. ⚠️ **Consider sanitizing or excluding `type="password"` from the inspection view.**
- 🟡 **Hidden inputs with sensitive tokens** — `<input type="hidden" name="csrf" value="...">`. Truncated but exposed.
- 🟡 **`aria-label` containing PII** — exposed to backend.
- 🟡 **Comments in HTML** — `cloneNode(true)` clones comments. Verify they're not exposed (or are deliberately stripped).
- 🟡 **`<script>` tag bodies** — pruned by `NOISE_SELECTOR`. Verify on a page with inline data scripts.
- 🟡 **`localStorage` / `sessionStorage` of the page** — we don't read these. Verify (regression check).
- 🔴 **API key in network tab** — verify it's sent as `x-api-key` header only, never as a URL query parameter.
- 🔴 **API key in console logs** — `console.error("API key auth failed: " + body)` would leak. Verify no key appears in any logged message.
- 🔴 **API key in error messages shown to user** — the error message should not echo the key. Verify.
- 🟡 **Token in any log** — `console.log("[selector-extension] AgentLoop settled", { sessionId, result })` — result doesn't contain tokens. But `state.set(response.state)` may include them. ⚠️ **Verify no token ends up in serialized state.**
- 🟡 **Token JWT visible to anyone with DevTools open** — chrome.storage.local is readable from the extension only. But a malicious page can NOT read it (different origin). Verify.
- 🟡 **Origin spoofing** — `page.origin` is sent in `StartPickerSession`. Comes from `tab.url` parsed in the popup. Spoofable if user manipulates? Probably not from a page context. Verify.
- 🟡 **Cookies attached to wrong domain** — verify SW fetch to `dev.intuned.io` carries the `dev.intuned.io` cookie, not a random page's.

---

## 10. Performance

- 🟡 **Pick on a page with 50k DOM nodes** — `inspectionView` does `body.cloneNode(true)` + DFS. Verify completion time < 500ms.
- 🟡 **`MAX_OUTPUT_SIZE = 250KB` truncation actually hits** — pick on a giant page. Verify the truncation marker appears and the backend handles a truncated view.
- 🟡 **Hover tracking lag** — `mousemove` fires very frequently. The `transition` CSS smooths it, but verify on a slow machine no jank.
- 🟡 **Memory leak across pick sessions** — open picker 50 times, cancel, re-open. Verify `chrome://memory` doesn't grow.
- 🟡 **WeakMap in `ElementRegistry`** — verify garbage collection happens when the registry is `release()`d.
- 🟡 **Long-running tab — extension running for days** — verify no slow leak in SW state.
- 🟡 **Multiple tabs with the extension active** — extension SW is singleton. Verify no degradation.
- 🟡 **Bundle size** — `popup.html` should load < 100ms. Today's bundle: ~18 KB popup + ~30 KB content + ~87 KB background. Verify on a cold start.

---

## 11. Accessibility

- 🟡 **Screen reader on the popup** — verify `aria-label`s on chips, status text in `aria-live`. Today `#results` has `aria-live="polite"`.
- 🟡 **Screen reader during pick** — the on-page overlay is not announced; user hears whatever the page announces. ⚠️ **Could add an `aria-live` region in the overlay shadow root.**
- 🟡 **Keyboard-only user picking** — no mouse, no hover. Today the picker requires hover-then-click. ⚠️ **Keyboard-only users currently can't pick.**
- 🟡 **Touchscreen / tablet** — no hover; tap acts as click. Verify the hover box doesn't get stuck.
- 🟡 **Stylus / pen** — verify behavior.
- 🟡 **Color contrast** — indigo / green highlights against arbitrary pages. May fail WCAG on some backgrounds.
- 🟡 **Color blindness** — indigo (hover) vs. green (picked) — distinguishable for deuteranopia? Verify.
- 🟡 **Reduced motion preference** — toolbar's `transition` and hover box transition don't respect `prefers-reduced-motion`. ⚠️ **Add media query.**
- 🟡 **Focus restoration after popup closes** — does the page get focus back? Verify.
- 🟡 **Tab order in popup** — Single → List → Multiple → status → Sign out. Verify logical.
- 🟡 **Esc closes the overlay, not the browser menu** — ordering of capture-phase listeners. Verify the browser's Esc-binding doesn't fire too.

---

## 12. Cross-browser

- 🔴 **Firefox** — extension supports Firefox per `wxt.config.ts`. Sign manifest, sideload, verify popup + picker work.
- 🔴 **Firefox-specific behavior** — `browser.tabs.query({active, currentWindow})` semantics may differ; `chrome.action.openPopup` is unsupported. Verify the fallback (bootstrap on next open) works.
- 🟡 **Edge** — Chromium-based; should be drop-in. Verify install + smoke.
- 🟡 **Brave** — Chromium with privacy hardening (script blocking, cookie blocking). Verify `dev.intuned.io` requests aren't blocked.
- 🟡 **Opera, Vivaldi** — Chromium-based; usually fine.
- 🟡 **Arc** — Chromium; verify popup positioning (Arc has unusual chrome).

---

## 13. Installation & permissions

- 🟡 **Fresh install** — first popup open shows sign-in. Verify storage starts empty.
- 🟡 **Permission prompt on install** — `activeTab`, `scripting`, `storage`. Verify what the user sees.
- 🟡 **`host_permissions` review** — `https://dev.intuned.io/*` and `http://localhost:3000/*` shown to user. ⚠️ **`localhost` in a shipped extension may raise eyebrows on store review; replace before shipping per the comment in `wxt.config.ts`.**
- 🟡 **Extension disabled mid-session** — user toggles off in `chrome://extensions`. Picker overlay survives (CS still loaded), but no more BG. Verify no orphan overlay.
- 🟡 **Extension uninstalled mid-session** — content script invalidated. Picker overlay frozen. Verify no console errors.
- 🟡 **Extension updated** — new SW takes over. In-flight session lost. Verify the popup recovers.
- 🟡 **Update changes manifest permissions** — Chrome shows a re-permission prompt; until accepted, extension is disabled.
- 🔴 **E2E bridge must NOT be present in prod build** — `import.meta.env.MODE === "e2e"` gate. Verify with `yarn build` then grep the output for `__intunedE2E` — should be absent.
- 🟡 **`<all_urls>` must NOT be present in prod build** — same: `yarn build` then check manifest `host_permissions`.

---

## 14. Build & packaging

- 🟡 **Source maps in prod** — verify `wxt build` doesn't emit `.map` files (or that they're not referenced from the JS).
- 🟡 **`console.log` in prod** — `agentLoopController.ts` and `bootstrapPopup` log. Verify these are intended (they're useful for debugging) or strip.
- 🟡 **Bundle size deltas** — track over time. A surprise jump means a heavy dep snuck in.
- 🟡 **Manifest valid JSON** — `wxt build` validates, but a manual `chrome://extensions → Load unpacked` check is cheap.
- 🟡 **Icon presence + sizes** — 16, 32, 48, 128. Verify after a `yarn icons` regeneration.
- 🟡 **Locale strings** — none today. If added: verify `_locales/` structure.
- 🔴 **Firefox AMO** — signed addon, signed `.xpi`, gecko id matches `wxt.config.ts`.
- 🔴 **Chrome Web Store policies** — host permissions justification ("Why does this need `dev.intuned.io`?"). Prepare a 1-paragraph answer.

---

## 15. Misc weirdness worth testing once

- 🟡 **Very small viewport** (300x200) — toolbar may exceed viewport.
- 🟡 **Very large viewport** (8K monitor) — verify highlights still align (browser zoom math may overflow).
- 🟡 **Multiple monitors with different DPIs** — drag toolbar to second monitor, verify positioning.
- 🟡 **Window minimized during agent loop** — verify loop continues (it does — SW is independent of window state).
- 🟡 **System wake from sleep mid-loop** — fetch may have stalled. Verify it errors out cleanly.
- 🟡 **DST / clock change** — `capturedAt` is ISO. Verify backend isn't sensitive.
- 🟡 **System locale `tr-TR`** — Turkish-i casing bug famously breaks string comparisons. Verify enum / status comparisons.
- 🟡 **RTL pages** — Arabic, Hebrew sites. Verify the toolbar's `right: 12px` makes sense (it does — fixed position, viewport-anchored).
- 🟡 **`<body dir="rtl">`** — same.
- 🟡 **Page that opens an `alert()` / `confirm()` / `prompt()`** during pick — modal browser dialog blocks the page. Verify the picker overlay doesn't hang.
- 🟡 **`window.print()` triggered by page** — verify no overlay artifact in the printed output.
- 🟢 **Drag-and-drop into the page** from the OS — should not be confused for a pick.

---

## 16. Things our automated suite explicitly does NOT cover

A reminder of where manual is the only signal:

- **Selector quality** — "did the backend produce a *good* selector". Layer 4 E2E asserts a selector comes back; it doesn't judge if it survives a 1% DOM change.
- **The popup-as-toolbar-panel flow** — Layer 4 uses an e2e bridge because Playwright can't drive a toolbar-launched popup faithfully. The popup's `tabs.query({active, currentWindow})` resolution path is therefore **never** exercised by tests. Spot-check live: click the extension icon, click Single, verify pick lands on the correct tab.
- **Real-world page diversity** — fixtures are synthetic.
- **Real-network behavior** — auth + agent loop use stubbed fetches.
- **Real-browser permission prompts** — never seen by tests.
- **Real `chrome.action.openPopup` allowance rules** — tested only with a stubbed rejection.

---

## How to use this document

1. For a **bug-fix PR**: spot-check section 2 (overlay) and section 5 (agent loop) on a real page.
2. For a **feature PR touching auth**: full pass on section 4 + section 9.
3. For a **release**: full pass on sections 1, 2, 5, 6, 10, 12, 13.
4. For a **fresh contributor**: read sections 6 and 9 before touching the SW or sending data to the backend.

When you find a new edge case in production, add it here with the appropriate tag — this doc is the institutional memory the test suite can't carry.
