import { getApiHeaders, getApiQueryParams } from "./manager";
// Import the api surface directly (not the barrel) so this background-only
// module never pulls in the messaging-backed forwarding sink.
import { trackEvent, trackException } from "@/lib/telemetry/api";
import { scrubUrlToHost } from "@/lib/telemetry/scrub";

/**
 * Fetch an Intuned backend REST endpoint with the active auth method applied:
 * explicit `x-api-key` / Bearer headers when configured (cookies omitted so the
 * explicit credential stays authoritative — the backend checks the session
 * cookie first), otherwise no auth headers and `credentials: "include"` so the
 * browser injects the session cookie. The api-key method's `workspaceId` query
 * param is appended automatically. Defaults the body content type to JSON.
 *
 * Throws AuthRequestError when signed out / unconfigured; callers surface the
 * message.
 */
export async function fetchIntunedApi(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const authHeaders = await getApiHeaders();
  const authQueryParams = await getApiQueryParams();

  const target = new URL(url);
  for (const [key, value] of Object.entries(authQueryParams ?? {})) {
    target.searchParams.set(key, value);
  }

  // Telemetry dimensions: host + pathname only — never the query string (it
  // carries the api-key workspace id) or the request body.
  const host = scrubUrlToHost(target.toString());
  const pathname = target.pathname;
  const method = (init.method ?? "GET").toUpperCase();
  const startedAt = Date.now();

  try {
    const res = await fetch(target.toString(), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
        ...authHeaders,
      },
      credentials: authHeaders ? "omit" : "include",
    });
    trackEvent({
      name: "api.request",
      properties: {
        host,
        pathname,
        method,
        ok: String(res.ok),
        statusCode: String(res.status),
      },
      measurements: { durationMs: Date.now() - startedAt },
    });
    return res;
  } catch (error) {
    // Network-level failure (DNS, offline) — the response never arrived. Skip
    // user-initiated cancels (agent-loop abort), which aren't real failures.
    const aborted =
      init.signal?.aborted ||
      (error instanceof DOMException && error.name === "AbortError");
    if (!aborted) {
      trackException({
        error,
        properties: { host, pathname, method, context: "api.request" },
        measurements: { durationMs: Date.now() - startedAt },
      });
    }
    throw error;
  }
}
