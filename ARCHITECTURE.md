# Selector Extension — Architecture

> Reference for the wiring and module boundaries of the extension. Most of the scaffolding is now implemented; remaining stubs and follow-ups are called out in section 10.

---

## 1. What the extension does

The user wants to generate a **reliable selector** (CSS or XPath) for elements on an arbitrary web page. The flow:

1. User opens the **popup**, picks a mode (`single` | `list`).
2. The popup tells the **background** to start a session.
3. The background activates the **content script's picker overlay**.
4. The user clicks elements in the page; clicks **Done** (or **Cancel**).
5. The background runs an **agent loop** against the backend AI:
   - Backend proposes candidate selectors.
   - Extension tests them against the live DOM and returns results.
   - Backend gets results back in updated state POST rquest input, decides on a winner.
6. Settled result is broadc ast back to the popup, which renders the selector + a **copy** button.

---

## 2. Contexts and their responsibilities

| Context            | Lives in                    | Owns                                                                                                                                                                                                                                                                                                         |
| ------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Background SW**  | `entrypoints/background.ts` | The singleton **session state**, the **agent loop controller**, all outbound network I/O, and registration of background-bound message handlers.                                                                                                                                                             |
| **Content script** | `entrypoints/content.ts`    | All page-DOM access via the `PickerSession` class (which owns the picker overlay, element registry, and inspection-view builder), and registration of content-bound message handlers. Handlers themselves are stateless executors of work units; per-page picker-session state lives inside `PickerSession`. |
| **Popup UI**       | `entrypoints/popup/*`       | Render mode controls + user/billing info, render in-flight / settled session, send intents to background, listen for BG-pushed events.                                                                                                                                                                       |

Each context is a hard isolation boundary; every cross-boundary call goes through the messaging layer below.

---

## 3. The messaging layer

### Three protocols, one per receiver

`lib/messaging/protocol.ts` defines three enums + three protocol maps:

```
BackgroundMessageType   →  BackgroundProtocolMap   (popup/CS  →  BG)
ContentMessageType      →  ContentProtocolMap      (BG        →  CS, per tab)
PopupMessageType        →  PopupProtocolMap        (BG        →  popup, broadcast)
```

Why a separate enum + map per **receiver** instead of one giant table:

- **Direction is the natural axis.** A handler in the background only ever receives `BackgroundMessageType`. A handler in the content script only ever receives `ContentMessageType`. Partitioning by receiver makes the registration tables exhaustive and the misuse cases unrepresentable.
- **Name collisions are impossible by construction.** Each enum value carries a surface prefix (`bg:`, `cs:`, `popup:`), so even though all three protocols share Chrome's single `runtime.sendMessage` bus, they never see each other's traffic.
- **Strong end-to-end typing.** Each entry in a protocol map is a function type; webext-core's `GetDataType` / `GetReturnType` derive the payload and response type from the enum key. A sender that uses the wrong key, or wrong payload shape, fails to compile.

### Messenger clients — the small abstraction each context uses

`lib/messaging/{backgroundMessenger,contentMessenger,popupMessenger}.ts` expose a typed client per surface:

```ts
// Background → Content (per tab) and Background → Popup (broadcast)
BackgroundMessagingClient {
  toContent<K extends ContentMessageType>(tabId, type, data): Promise<Response>
  toPopup<K extends PopupMessageType>(type, data): Promise<Response | undefined>
}

// Content → Background
ContentMessagingClient {
  toBackground<K extends BackgroundMessageType>(type, data): Promise<Response>
}

// Popup → Background  +  subscribe to Background → Popup events
PopupMessagingClient {
  toBackground<K extends BackgroundMessageType>(type, data): Promise<Response>
  onEvent<K extends PopupMessageType>(type, listener): () => void
}
```

Handlers never touch `chrome.runtime` or `browser.runtime` directly — they receive a messenger via deps, which makes them trivially fakeable in unit tests.

### Handler registration — the existing pattern, enum-keyed

`registerBackgroundHandlers` and `registerContentHandlers` mirror the existing `registerHandlers` pattern with two upgrades:

1. Keys are enum values, not string literals.
2. The registry takes a `BackgroundContext` (or `ContentContext`) and injects it into every handler call — so a handler is a pure function of `(data, deps)`.

The handler table type is a mapped type over the enum:

```ts
type BackgroundHandlers = {
  [K in BackgroundMessageType]: BackgroundHandler<K>;
};
```

A missing or extra key is a compile error: adding a new message type forces a corresponding handler before the build will pass.

---

## 4. Background internals

### Singletons (constructed once in `entrypoints/background.ts`)

| Singleton                   | Role                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SelectorState`             | Holds two sibling slots: the single in-flight `SelectorCreateState` (schema mirrored in `lib/state/schema.ts` from `apps/web/lib/Modules/SelectorAgent/selectoragent.schema.ts`) **and** a frontend-only `meta: SessionMeta \| null` slot for runtime info that must not leak into the backend contract — currently the owning `tabId`. `set` / `update` only touch the contract slot; `setMeta` / `getMeta` touch meta; `clear` wipes both. |
| `AgentLoopController`       | Drives the agent ↔ browser turn-taking. Knows how to take a `step` against the backend, dispatch a `test_selectors` `NextAction` to the content script (routing via `state.getMeta()?.tabId`), and fold the result back.                                                                                                                                                                                                                     |
| `BackgroundMessagingClient` | The outbound side of the messaging layer.                                                                                                                                                                                                                                                                                                                                                                                                    |

### `BackgroundContext`

Every BG handler receives (see `lib/background/context.ts`):

```ts
{
  state,                       // SelectorState (contract + meta)
  agentLoopController,         // AgentLoopController
  backgroundMessagingClient,   // BackgroundMessagingClient (toContent / toPopup)
  sender,                      // chrome.runtime.MessageSender — tab/frame info for this call
}
```

`sender` is the only field that varies per invocation; the rest are shared. The handler-call shape is `BackgroundHandlerContext = BackgroundContext & { sender }`. The tab id for routing lives on `state.meta` rather than as a separate closure on the background context — single source of truth, cleared in lockstep with the session.

### Handlers (one file each, under `lib/background/handlers/`)

| Message                                               | What it does                                                                                                                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BootstrapPopup`                                      | Returns `{ auth, session }` snapshot so the popup can render its initial frame in one round-trip.                                                                                                     |
| `StartPickerSession`                                  | Resolves the sender's tab, records it on `state.meta`, seeds fresh contract state, dispatches `ActivatePicker` to that tab.                                                                           |
| `CancelPickerSession`                                 | Reads tab id from `sender` (or `state.meta`), aborts the agent loop, clears state (also wipes meta), dispatches `DeactivatePicker`.                                                                   |
| `StartAgent`                                          | Content reports `{ sessionId, targets, inspectionView }` after the user clicks Done. Validates the in-flight session matches, folds targets into state, kicks off `agentLoopController.runAgentLoop`. |
| `ReportPickerError`                                   | Records error on state, emits `SelectorGenerationSettled` to popup with `status: "error"`.                                                                                                            |
| `InitializeAuth` / `SignIn` / `SignOut` / `SetApiKey` | Auth — delegates to the existing auth manager; kept on the BG surface so the registration pattern stays uniform.                                                                                      |

---

## 5. Content script internals

### `ContentContext`

A deliberately tiny dep bundle (see `lib/content/context.ts`):

```ts
{
  picker,                    // PickerSession — the ONLY path to the page DOM
  contentMessagingClient,    // ContentMessagingClient — the ONLY path to the background
}
```

The content handlers themselves are **stateless executors** — they translate a BG message into a `picker.*` call (or a DOM result back into a BG message). The per-page picker-session state (current registry + overlay) lives inside `PickerSession`, not on the handler context.

### `PickerSession`

`lib/content/dom/pickerSession.ts` is the single class that owns the per-page selector-picker lifecycle. It is instantiated once per content script and injected via `ContentContext.picker`. There is no separating interface — one implementation, one consumer; tests substitute a stub object on the context. Methods:

- `activatePicker(opts, callbacks)` / `deactivatePicker()` — overlay lifecycle. The overlay calls back into the content handler with `{ targets, inspectionView }` on submit, or signals cancel.
- `testSelectors(selectors, { collectHtml })` — runs candidates against the live DOM via the registry built up during the active picker session; returns per-selector matches and, when requested, an `elementHtmlById` map for feedback. Throws if called with no active picker session — the registry's lifetime _is_ the session's lifetime.

Internally `PickerSession` holds `currentRegistry: ElementRegistry | null` and `currentOverlay: PickerOverlay | null`, composing three collaborators in `lib/content/dom/`:

- `PickerOverlay` — mounts the click-capture overlay, drives mode-specific selection UX.
- `ElementRegistry` — assigns stable ids to picked / matched DOM elements and looks them up by selector.
- `buildInspectionView` — serializes the picked elements into the inspection-view snapshot the agent prompts on.

Highlighting the final winner is still a planned method on this surface; see section 7.

### Handlers (`lib/content/handlers/`)

| Message                  | What it does                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `ActivatePicker`         | `picker.activatePicker(...)`. Overlay later calls `messaging.toBackground(StartAgent)` on submit, or `CancelPickerSession` on cancel. |
| `DeactivatePicker`       | `picker.deactivatePicker()`. Used on cancel and settle.                                                                               |
| `TestSelectors`          | `picker.testSelectors(...)` — request/response. The response **is** the agent loop's input.                                           |
| `HighlightFinalSelector` | Planned: visualize the winning selector in the page. Currently a stub.                                                                |

---

## 6. Popup internals

The popup is a UI shell with no domain state of its own. It:

- Calls `BootstrapPopup` on open to render its initial frame in one round trip.
- Sends mode + page-context to `StartSelectorSession` when the user picks a mode.
- Subscribes to `SessionStateChanged` and `SelectorGenerationSettled` via `messaging.onEvent` so it can re-render when the BG-owned state moves.
- On settle: shows the selector + a copy button. On error: shows the error and a retry.

---

## 7. End-to-end flow

```
[Popup]                       [BG]                              [Content]                  [Backend]
  |                             |                                   |                          |
  |── StartPickerSession ─────▶|                                   |                          |
  |  (mode, pageContext)        |── seed state                     |                          |
  |                             |── state.setMeta({ tabId })       |                          |
  |                             |── toContent(ActivatePicker) ────▶|                          |
  |                             |                                   |── mount overlay         |
  |                             |                                   |   user picks elements    |
  |                             |                                   |   user clicks Done       |
  |                             |◀── StartAgent ───────────────────|                          |
  |                             |   (sessionId, targets, inspectionView) |                    |
  |                             |── fold into state                |                          |
  |                             |── agentLoop.runAgentLoop ────────────────────────────────▶ |
  |                             |                                                   step()    |
  |                             |◀── NextAction: test_selectors ───────────────────────────── |
  |                             |── toContent(TestSelectors) ─────▶|                          |
  |                             |  (tabId from state.getMeta())     |── picker.testSelectors  |
  |                             |◀── results ───────────────────────|                          |
  |                             |── fold result → step() ──────────────────────────────────▶ |
  |                             |◀── NextAction: done (bestSelector) ───────────────────────── |
  |                             |── toContent(HighlightFinalSelector) ▶|                       |
  |                             |── toPopup(SelectorGenerationSettled) |                       |
  |◀── SelectorGenerationSettled |                                   |                          |
  |   render selector + copy    |                                   |                          |
```

Cancel path: popup → `CancelPickerSession` → `agentLoop.cancel()` + `state.clear()` (wipes contract **and** meta) + `DeactivatePicker`.

Error path: any handler records the error on state, BG emits `SelectorGenerationSettled` with `status: "error"`.

---

## 8. Design patterns and principles applied

### Patterns

- **Registry + dispatch.** Each context owns a `{ [K in MessageEnum]: Handler<K> }` table; `register*Handlers` walks it and binds onMessage subscriptions. Replaces ad-hoc `if (msg.type === ...)` switches.
- **Dependency injection over imports.** Handlers receive `state`, `agentLoop`, `messaging` (and `dom` on the content side) as deps rather than importing module-level singletons. Same pattern the backend uses for its services — fakes plug in trivially.
- **Singleton.** `SelectorStateSingleton` and `AgentLoopController` live for the lifetime of the service worker. Encapsulated behind classes (not module-level state) so they can be re-instantiated cleanly in tests.
- **Controller + state-machine.** `AgentLoopController` owns the `idle → running → awaiting_browser → ...` transitions. Handlers never call the backend directly.
- **Lifecycle-scoped DOM owner (`PickerSession`).** All page-DOM I/O sits behind a single class whose lifetime is the picker session; `testSelectors` is gated on having an active session so the registry can never go stale. No separating interface — there is one implementation, swapped in tests via a stub on `ContentContext.picker`.
- **Session-scoped routing state.** Frontend-only runtime info (currently the owning tab id) lives on a `meta` sibling slot of `SelectorState` rather than as a side-channel on `BackgroundContext`. The slot's lifetime is the session's lifetime — `state.clear()` wipes it in lockstep — and it is never serialized to the backend, since the contract slot is what gets POSTed.
- **Protocol-as-type.** The messaging contract is a TypeScript type that the runtime layer (webext-core) consumes via type-level helpers — request/response shapes can't drift between sender and receiver.

### Principles

- **Direction-partitioned surfaces.** Three protocols (BG-bound, CS-bound, popup-bound) instead of one. Each is exhaustively typed by the receiver's enum so handler tables can't be incomplete.
- **Make impossible states unrepresentable.** Mapped types over the message enum force every handler to exist; missing keys are compile errors, not runtime no-ops.
- **Single source of truth for state.** The selector session lives in exactly one place (BG singleton), with the popup observing it via events. No client-side mirroring, no eventual consistency between contexts.
- **Stateless content scripts.** Per-tab handlers are executors of work units, not state machines. The single in-flight session lives in BG.
- **Least privilege per context.** Content handlers get `DomAccess` + a BG messenger and nothing else — they have no access to auth tokens, network, or session state. Background handlers get state + agent loop but no direct DOM.
- **Don't decorate primitives.** Reuse webext-core's runtime, the existing register-handlers pattern, and the existing schema; the scaffold adds typing and structure without re-implementing.
- **Mirror the backend contract verbatim.** The state schema is a literal copy of the agent state schema in WebApp, so the same envelope round-trips between extension and backend without translation layers.

---

## 9. File map

```
apps/selector-extension/
├─ entrypoints/
│  ├─ background.ts                # construct singletons, register BG handlers
│  ├─ content.ts                   # construct PickerSession + messenger, register CS handlers
│  └─ popup/
│     ├─ index.html
│     ├─ main.ts                   # popup messenger + bootstrap + render
│     └─ style.css
└─ lib/
   ├─ state/
   │  ├─ schema.ts                 # mirrored from apps/web/.../selectoragent.schema.ts
   │  ├─ state.ts                  # SelectorState — contract slot + meta slot (SessionMeta)
   │  └─ index.ts
   ├─ agent/
   │  ├─ agentLoopController.ts    # agent ↔ browser turn-taking
   │  └─ index.ts
   ├─ messaging/
   │  ├─ protocol.ts               # enums + protocol maps + per-surface defineExtensionMessaging
   │  ├─ backgroundMessenger.ts    # toContent + toPopup
   │  ├─ contentMessenger.ts       # toBackground
   │  ├─ popupMessenger.ts         # toBackground + onEvent
   │  └─ index.ts
   ├─ background/
   │  ├─ context.ts                # BackgroundContext + BackgroundHandlerContext
   │  ├─ registerHandlers.ts       # enum-keyed registration
   │  ├─ handlers/                 # one file per BackgroundMessageType
   │  │  ├─ bootstrapPopup.ts
   │  │  ├─ startSelectorPickerSession.ts   # handleStartPickerSession
   │  │  ├─ cancelSelectorPickerSession.ts  # handleCancelPickerSession
   │  │  ├─ startAgent.ts                   # content -> BG: targets + inspectionView, kicks off agent loop
   │  │  ├─ reportPickerError.ts
   │  │  ├─ auth.ts                         # initializeAuth / signIn / signOut / setApiKey
   │  │  └─ index.ts                        # the exhaustive handler table
   │  └─ index.ts
   ├─ content/
   │  ├─ context.ts                # ContentContext { picker, contentMessagingClient }
   │  ├─ registerHandlers.ts
   │  ├─ dom/
   │  │  ├─ pickerSession.ts       # PickerSession — overlay + registry + selector tester
   │  │  ├─ pickerOverlay.ts
   │  │  ├─ elementRegistry.ts
   │  │  └─ inspectionView.ts
   │  ├─ handlers/                 # one file per ContentMessageType
   │  │  ├─ activatePicker.ts
   │  │  ├─ deactivatePicker.ts
   │  │  ├─ testSelectors.ts
   │  │  ├─ highlightFinalSelector.ts       # (stub — see section 7 TODO)
   │  │  └─ index.ts
   │  └─ index.ts
   ├─ auth/                        # auth manager + providers
   └─ config.ts
```

---

## 10. What is still open

- **`HighlightFinalSelector`** — handler is wired and `PickerSession` reserves the surface, but the implementation is still a stub.
- **Multi-tab sessions.** `SelectorState` is single-slot and `AgentLoopController` is a single instance — a second `StartPickerSession` cancels the first. The path to multi-tab is to key both off `sessionId` (state becomes a map; controller becomes per-session). See the design notes / commit history for the trade-off rationale; for now the `meta` slot is the smallest step in that direction.
- **Service-worker eviction.** Both `SelectorState.current` / `.meta` and the agent-loop abort controller live only in memory. A worker suspension mid-session loses routing. Persisting to `chrome.storage.session` is the follow-up.
- **Tab-lifecycle invalidation.** Nothing listens to `tabs.onRemoved` / `onReplaced`; a stale tab id in `state.meta` is only discovered when `toContent` fails. A listener that calls `agentLoopController.cancel()` + `state.clear()` is the right shape.
- **Picker re-injection into pre-existing tabs after install.** WXT's default config handles new navigations; back-fill TBD.
