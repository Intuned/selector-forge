import type { SelectorCreateState, SelectorHistoryEntry } from "@/lib/state";
import type { SelectorStatus } from "@/lib/state";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

/** A valid in-progress session state for the SessionInProgress component. */
export function makeSession(
  status: Extract<SelectorStatus, "picking" | "running">
): SelectorCreateState {
  return {
    schemaVersion: 2,
    sessionId: "sess_ladle_demo",
    mode: "single",
    status,
    page: {
      url: "https://news.ycombinator.com/news",
      origin: "https://news.ycombinator.com",
      title: "Hacker News",
      capturedAt: minutesAgo(1),
    },
    targets: [{ elementId: "el-1" }],
    example: { inspectionView: "<a class='titlelink'>…</a>", targetElementIds: ["el-1"] },
    seedCandidates: [],
    messages: [],
    browserRequest: null,
    browserResult: null,
    correctSelectors: [],
  };
}

/** A history entry for the HistoryItem component. */
export function makeHistoryEntry(
  overrides: Partial<SelectorHistoryEntry> = {}
): SelectorHistoryEntry {
  return {
    id: "hist_ladle_demo",
    createdAt: minutesAgo(42),
    url: "https://www.example.com/products/widgets",
    mode: "single",
    selector: { type: "css", value: "a.product-card__title" },
    langsmithRunId: "run_abc123",
    matchCount: 1,
    ...overrides,
  };
}
