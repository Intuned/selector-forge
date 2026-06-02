import type { PickMode } from "../types";

export type Message =
  | { type: "START_PICK"; mode: PickMode }
  | { type: "SELECTOR_REQUEST"; body: unknown }
  | { type: "OPEN_POPUP" };
