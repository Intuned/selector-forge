import { z } from "zod";

export const SELECTOR_HISTORY_SCHEMA_VERSION = 2 as const;

export const selectorTypeSchema = z.enum(["css", "xpath"]);
export type SelectorType = z.infer<typeof selectorTypeSchema>;

export const selectorSchema = z.object({
  type: selectorTypeSchema,
  value: z.string().min(1),
});
export type SelectorRecord = z.infer<typeof selectorSchema>;

export const selectorModeSchema = z.enum(["single", "list"]);
export type SelectorMode = z.infer<typeof selectorModeSchema>;

export const selectorStatusSchema = z.enum([
  "picking",
  "running",
  "awaiting_browser",
  "done",
  "error",
]);
export type SelectorStatus = z.infer<typeof selectorStatusSchema>;

// current page context when the user initiated the selector generation flow.
export const pageContextSchema = z.object({
  url: z.string().url(),
  origin: z.string(),
  title: z.string().optional(),
  capturedAt: z.string().datetime(),
});
export type PageContext = z.infer<typeof pageContextSchema>;

// input for the selector agent to generate selectors:
// a single example with a list of target element ids + inspection view
// a target element is the element the user picks
export const targetSchema = z.object({
  elementId: z.string(),
  elementXpath: z.string().optional(),
});
export type TargetRecord = z.infer<typeof targetSchema>;

export const exampleSchema = z.object({
  inspectionView: z.string(),
  targetElementIds: z.array(z.string()).min(1),
});
export type ExampleRecord = z.infer<typeof exampleSchema>;

export const candidateSourceSchema = z.enum(["extension_seed", "agent"]);
export type CandidateSource = z.infer<typeof candidateSourceSchema>;

export const candidateSchema = z.object({
  selector: selectorSchema,
  strategy: z.string(),
  matchCount: z.number().int().nonnegative(),
  exact: z.boolean(),
  source: candidateSourceSchema,
});
export type CandidateRecord = z.infer<typeof candidateSchema>;

export const toolCallSchema = z.object({
  id: z.string(),
  name: z.string(), // v1: only "submit_selectors"
  args: z.unknown(), // v1: { selectors: SelectorRecord[] }
});
export type ToolCallRecord = z.infer<typeof toolCallSchema>;

// On-wire transcript: only assistant tool calls + tool results.
// The system prompt and initial user framing are server-only IP and
// are reconstructed each turn from `example` + `targets`.
export const agentMessageSchema = z.object({
  role: z.enum(["assistant", "tool"]),
  content: z.string(),
  toolCalls: z.array(toolCallSchema).optional(),
  toolCallId: z.string().optional(),
});
export type AgentMessage = z.infer<typeof agentMessageSchema>;

// Browser actions request from the agent to the extension
export const browserRequestTypeSchema = z.enum(["test_selectors"]);
export type BrowserRequestType = z.infer<typeof browserRequestTypeSchema>;

// At most one browser request is in-flight at a time. The lifecycle is:
//   - request set, result null      → awaiting extension
//   - request set, result.requestId === request.id → ready to fold into messages
// On the next turn, both fields are replaced (or cleared on `done`). The
// historical record of prior requests lives in `messages` as tool-call /
// tool-result pairs.
export const browserRequestSchema = z.object({
  id: z.string(),
  type: browserRequestTypeSchema,
  createdAt: z.string().datetime(),
  selectors: z.array(selectorSchema).min(1),
  needHtmlForFeedback: z.boolean().optional(),
  toolCallId: z.string(),
});
export type BrowserRequestRecord = z.infer<typeof browserRequestSchema>;

export const selectorResultSchema = z.object({
  selector: selectorSchema,
  foundElementIds: z.array(z.string()),
});
export type SelectorResultRecord = z.infer<typeof selectorResultSchema>;

export const browserResultSchema = z.object({
  requestId: z.string(),
  completedAt: z.string().datetime(),
  selectorResults: z.array(selectorResultSchema),
  elementHtmlById: z.record(z.string(), z.string()).optional(), // Populated when needHtmlForFeedback was set
});
export type BrowserResultRecord = z.infer<typeof browserResultSchema>;

export const finalResultSchema = z.object({
  status: z.enum(["ok", "fallback", "error"]),
  bestSelector: selectorSchema.optional(), // best generated candidate selector
  note: z.string().optional(),
  // LangSmith root run id for the trace that produced this result; attached to
  // the history entry so the popup can submit thumbs up/down feedback for it.
  langsmithRunId: z.string().optional(),
});
export type FinalSelectorResult = z.infer<typeof finalResultSchema>;

export const selectorErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  source: z.enum(["extension", "backend", "model", "browser"]),
  recoverable: z.boolean(),
});
export type SelectorErrorRecord = z.infer<typeof selectorErrorSchema>;

// SELECTOR AGENT STATE INTERFACE
export const selectorCreateStateSchema = z.object({
  schemaVersion: z.literal(SELECTOR_HISTORY_SCHEMA_VERSION),
  sessionId: z.string().min(1),
  mode: selectorModeSchema,
  status: selectorStatusSchema,

  page: pageContextSchema,
  targets: z.array(targetSchema).min(1),
  example: exampleSchema,

  seedCandidates: z.array(candidateSchema),
  messages: z.array(agentMessageSchema),
  browserRequest: browserRequestSchema.nullable(),
  browserResult: browserResultSchema.nullable(),

  correctSelectors: z.array(selectorSchema),
  finalResult: finalResultSchema.optional(),
  errors: z.array(selectorErrorSchema).optional(),
});
export type SelectorCreateState = z.infer<typeof selectorCreateStateSchema>;

export const selectorFeedbackSchema = z.enum(["up", "down"]);
export type SelectorFeedback = z.infer<typeof selectorFeedbackSchema>;

export const selectorHistoryEntrySchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  url: z.string(),
  mode: selectorModeSchema,
  // The single selector the agent settled on. Its `type` drives the badge; the
  // popup no longer keeps a css/xpath pair to toggle between.
  selector: selectorSchema,
  // LangSmith run id this selector came from; present only when the backend
  // surfaced one. Gates the thumbs up/down control in the popup.
  langsmithRunId: z.string().optional(),
  // Elements the selector matched on the source page, counted once when the
  // entry was stored. The popup shows this fixed count rather than re-counting
  // against the live page on every open. Optional for entries stored before
  // this field existed.
  matchCount: z.number().int().nonnegative().optional(),
  // The user's last submitted rating for this selector, if any.
  feedback: selectorFeedbackSchema.optional(),
});
export type SelectorHistoryEntry = z.infer<typeof selectorHistoryEntrySchema>;

// request envelopes
export const selectorCreateRequestSchema = selectorCreateStateSchema;
export type SelectorCreateRequest = z.infer<typeof selectorCreateRequestSchema>;

// response envelopes
export const nextActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("test_selectors"), requestId: z.string() }),
  z.object({ type: z.literal("done") }),
  z.object({ type: z.literal("error") }),
]);
export type NextAction = z.infer<typeof nextActionSchema>;

export const selectorCreateResponseSchema = z.object({
  state: selectorCreateStateSchema, // updated state
  action: nextActionSchema,
});
export type SelectorCreateResponse = z.infer<
  typeof selectorCreateResponseSchema
>;
