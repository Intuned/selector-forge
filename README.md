# Selector Forge

> Pick an element on any page, get back a **reliable** selector — generated and judged by AI, then re-verified against the live DOM before you ever see it.

Selector Forge is a standalone browser extension (Chrome & Firefox, MV3) that helps you build robust CSS or XPath selectors directly from the pages you're looking at. You point at what you want; the extension and [Intuned](https://intuned.io)'s selector backend do the rest — proposing candidates, testing them against the real page, and discarding anything that doesn't resolve correctly.

It's useful for writing end-to-end tests, building scrapers, and automating any page where a brittle selector would cost you later.

## Install

- **Chrome** — [Chrome Web Store](https://chromewebstore.google.com/detail/selector-forge-ai-selecto/lbendfnlmhdakbeblajoffkfmafbfaha)
- **Firefox** — [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/selector-forge/)

## How it works

1. Open any page and click the extension.
2. Choose a **selection mode** and pick element(s) directly on the live page.
3. The extension captures a compact snapshot of your picks (selected targets, DOM context, seed candidates) and sends it to the backend.
4. The backend proposes and ranks candidate selectors; the extension **tests every candidate against the live DOM** and feeds the results back.
5. This loop repeats until the backend settles on a winner.
6. The popup shows only **re-verified** selectors, each with a copy button.

The browser is always the source of truth for what a selector actually matches. The AI proposes and ranks; it never gets the final word on correctness.

### The trust boundary

- The extension holds the selector-creation session state — the source of continuity for the loop.
- The browser is the source of truth — re-verification is mandatory for every result.
- The AI proposes and ranks selectors; it does not prove correctness.
- For lists, verification checks the **full** intended set, so over-matching and under-matching selectors are rejected.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the module map, the messaging layer, the background/content/popup contexts, and the auth + CLI seams.

## Selection modes

| Mode       | You do                                 | You get                                                                                                |
| ---------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Single** | Pick one element                       | Verified selector candidates for that exact element — buttons, inputs, links, labels, one-off targets. |
| **List**   | Pick two examples from a repeating set | A verified container selector for the full set, previewed before you save it.                          |

## Dev quickstart

Requires Node 18+ and Yarn.

```bash
yarn install         # also runs `wxt prepare`
yarn dev             # watch + load .output/chrome-mv3 in Chrome (unpacked)
yarn dev:firefox     # same for Firefox
```

After the first `yarn dev`, load the unpacked extension from `.output/chrome-mv3` at `chrome://extensions` (enable Developer mode).

## Commands

| Command                             | What it does                                                        |
| ----------------------------------- | ------------------------------------------------------------------- |
| `yarn dev` / `yarn dev:firefox`     | Watch build, loadable as an unpacked extension                      |
| `yarn compile`                      | `tsc --noEmit` typecheck                                            |
| `yarn test`                         | Vitest — unit + real-Chromium browser projects                      |
| `yarn build` / `yarn build:firefox` | Production extension bundle                                         |
| `yarn build:e2e`                    | E2E variant with `<all_urls>` host permission — **never ship this** |
| `yarn e2e`                          | `build:e2e` then Playwright against the packaged extension          |
| `yarn zip` / `yarn zip:firefox`     | Store-ready zip                                                     |
| `yarn icons`                        | Regenerate icon assets                                              |
| `yarn ladle`                        | Preview popup components in isolation at `http://localhost:61010`    |

### Component previews (Ladle)

`yarn ladle` serves the popup's React components in isolation for design and review — no extension reload, no real backend. Stories live in [stories/](./stories) (`*.stories.tsx`); Ladle config is in [.ladle/](./.ladle). The popup expects WXT's injected `browser` global, so [.ladle/wxt-globals.ts](./.ladle/wxt-globals.ts) installs a no-op stub for it. `yarn ladle:build` produces a static bundle under `dist/ladle`.

### Testing layers

- **Unit** — fast Vitest tests (node/happy-dom) for selector logic, state transforms, storage, and deterministic fallbacks.
- **Browser** — Vitest browser-mode tests that run selector generation against a real DOM and prove each candidate resolves to exactly the expected element set. This is the correctness oracle. Both layers run under `yarn test`.
- **E2E** — Playwright against the packaged MV3 extension with a real page, pointer flow, popup, content script, and background worker. Run with `yarn e2e`.

## Telemetry

The extension reports anonymous diagnostics to Azure Application Insights so we can
spot errors and usage issues in the wild. It is **anonymous** (a random per-install
id — never your email, workspace name, browsed-page URLs, or selector strings) and can
be turned off from the workspace menu in the popup ("Share anonymous usage data").

What's collected: exceptions/unhandled rejections, command events with timing,
agent-loop outcomes, and Intuned API request host, path, status, and latency — never
the query string (it carries your workspace id). See [lib/telemetry/](./lib/telemetry).

The background service worker is the single egress; content and popup forward items
to it over the message protocol. Because an MV3 worker has no DOM and is short-lived,
the SDK pipeline is built from `@microsoft/applicationinsights-core-js` +
`-channel-js` directly (fetch transport, in-memory buffer) — not the Web SDK.

The Azure connection string is hard-coded in [lib/config.ts](./lib/config.ts)
(`HARDCODED_CONNECTION_STRING`); the write-only ingestion key is safe to embed in the
published bundle. Because it is always present, dev builds report too — while developing,
either use the in-popup opt-out or point telemetry at a throwaway resource by setting the
`config.appInsightsConnectionString` key in `browser.storage.local` (an empty value falls
back to the hard-coded string; clearing it restores the default).

## Project layout

```
entrypoints/
  background.ts     background service worker — session state, agent loop, network I/O
  content.ts        content script — picker overlay, DOM access, selector testing
  popup/            React popup — mode controls, results, copy actions
lib/
  agent/            agent loop controller (backend turn-taking)
  content/          picker overlay, element registry, DOM inspection
  background/       handlers, context menu, session wiring, CLI bridge
  messaging/        typed, direction-partitioned runtime-message protocol
  state/            session state, history, schema, preferences
  auth/             auth client + token handling
  graphql/          workspace + usage queries
  config.ts         API base + runtime config
tests/              vitest (unit + browser)
e2e/                playwright against the built extension
ARCHITECTURE.md     module map, trust boundary, agent loop, seams
```

Built on [WXT](https://wxt.dev) with React for the popup.

## Roadmap

- **CLI control** — drive the extension from the Intuned CLI: Intuned IDE support, local agents running end-to-end tests and automations, and exposure through MCP. (Foundational wiring — the `tabs` permission and CDP-driven session start — is already in place.)
- **Smart picker** — a `multiple` mode that lets you select many elements in one flow and have the extension group them into single items and list-like sets, plus AI field detection that suggests useful fields, names, and selectors for a page automatically.
- **Drill-down modes** — precision refinement after a pick: walk the XPath/DOM tree to the element you actually meant (child span → button → row → label → parent container), move a list selection to a parent or child level, and add required examples or exclude wrong ones.
- **Bring your own backend** — today the extension talks to Intuned for authentication and selector generation. We plan to ship a small, self-hostable reference backend that drops into that seam and replaces Intuned entirely — including an open-source agent that generates and judges reliable selectors — so you can run the whole loop on your own infrastructure.

Further out: selector/automation history, export to Playwright or plain JavaScript, automatic pagination detection, and cross-iframe / shadow-DOM support.

## Contributing

Issues and pull requests are welcome. Please run `yarn compile` and `yarn test` before opening a PR.

## License

[MIT](./LICENSE) © The Metrics Shop, Inc.
