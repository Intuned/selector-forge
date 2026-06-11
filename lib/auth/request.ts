import { getApiHeaders, getApiQueryParams } from "./manager";

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

  return fetch(target.toString(), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
      ...authHeaders,
    },
    credentials: authHeaders ? "omit" : "include",
  });
}
