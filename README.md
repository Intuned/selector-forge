# selector-extension

Intuned Selector — a standalone browser extension that lets a user pick an element on any page and get back a **reliable** selector (CSS or XPath), generated and judged by Intuned's selector backend.

> Status: **scaffold only.** Entry points and module boundaries are in place; features land per the plan.

## Dev quickstart

```bash
yarn install         # also runs `wxt prepare` (generates .wxt/tsconfig.json)
yarn dev             # watch + load .output/chrome-mv3 in Chrome (unpacked)
yarn dev:firefox     # same for Firefox
```

Load the unpacked extension from `.output/chrome-mv3` in `chrome://extensions` after the first `yarn dev` run.

## Other commands

| Command | What it does |
| --- | --- |
| `yarn compile` | `tsc --noEmit` typecheck |
| `yarn test` | Vitest (unit + browser projects) |
| `yarn build` / `yarn build:firefox` | Production extension bundle |
| `yarn build:e2e` | E2E variant — `<all_urls>` host permission; do not ship |
| `yarn e2e` | `build:e2e` then Playwright against the packaged extension |
| `yarn zip` / `yarn zip:firefox` | Store-ready zip |

## Architecture

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the module map, the trust boundary, the agent loop, and the auth + CLI/MCP seams.

Sub-app instructions for Claude live in [`.claude/CLAUDE.md`](./.claude/CLAUDE.md).

## Layout

```
entrypoints/        WXT entry points (background, picker, popup)
lib/
  picker/           DOM-only picker overlay + selection state (CLI/MCP seam)
  agent/            DOM-only agent loop, element registry, wire protocol (CLI/MCP seam)
  messaging/        typed runtime-message contract
  storage/          chrome.storage wrappers
  auth/             AuthClient interface + stubs (filled in by auth team)
  results/          popup-side renderer
tests/              vitest (unit + browser)
e2e/                playwright against the built extension
docs/               architecture notes
```

This is a standalone yarn project, not joined to the monorepo workspace — same pattern as `apps/browser-extensions`.
