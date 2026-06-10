export type {
  BackgroundContext,
  BackgroundHandlerContext,
  MessageSender,
} from "./context";
export {
  registerBackgroundHandlers,
  type BackgroundHandler,
  type BackgroundHandlers,
} from "./registerHandlers";
export { backgroundHandlers } from "./handlers";
export { registerSessionTabWatcher } from "./sessionTabWatcher";
