import type {
  GetDataType,
  GetReturnType,
  MaybePromise,
} from "@webext-core/messaging";
import {
  ContentMessageType,
  contentProtocol,
  type ContentProtocolMap,
} from "@/lib/messaging";
import type { ContentContext } from "@/lib/content";

export type ContentHandler<K extends ContentMessageType> = (
  data: GetDataType<ContentProtocolMap[K]>,
  ctx: ContentContext
) => MaybePromise<GetReturnType<ContentProtocolMap[K]>>;

export type ContentHandlers = {
  [K in ContentMessageType]: ContentHandler<K>;
};

export function registerContentHandlers(
  handlers: ContentHandlers,
  ctx: ContentContext
): void {
  const register = contentProtocol.onMessage as (
    type: ContentMessageType,
    cb: (message: { data: unknown }) => unknown
  ) => void;

  for (const key of Object.values(ContentMessageType)) {
    register(key, (message) => handlers[key](message.data as never, ctx));
  }
}
