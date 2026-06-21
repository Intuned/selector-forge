import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchIntunedApi } from "../../../lib/auth/request";

// `fetchIntunedApi` applies the active auth method (headers + query params from
// the auth manager) and shapes the outbound fetch: JSON content type, cookies
// omitted when an explicit credential is present (included otherwise), and the
// method's query params appended to the URL. Mock the manager to drive each
// method's output and stub global fetch to capture the request.

const { getApiHeadersMock, getApiQueryParamsMock } = vi.hoisted(() => ({
  getApiHeadersMock: vi.fn<() => Promise<Record<string, string> | undefined>>(),
  getApiQueryParamsMock: vi.fn<
    () => Promise<Record<string, string> | undefined>
  >(),
}));

vi.mock("@/lib/auth/manager", () => ({
  getApiHeaders: getApiHeadersMock,
  getApiQueryParams: getApiQueryParamsMock,
}));

// Telemetry is fire-and-forget; mock the public surface to capture the events
// `fetchIntunedApi` emits without standing up a real sink. (scrub.ts stays real
// so we exercise the actual host/path scrubbing.)
const { trackEventMock, trackExceptionMock } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
  trackExceptionMock: vi.fn(),
}));

vi.mock("@/lib/telemetry/api", () => ({
  trackEvent: trackEventMock,
  trackException: trackExceptionMock,
}));

const URL_BASE = "https://app.intuned.io/api/selectors/create";

function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchIntunedApi", () => {
  beforeEach(() => {
    getApiHeadersMock.mockReset().mockResolvedValue(undefined);
    getApiQueryParamsMock.mockReset().mockResolvedValue(undefined);
    trackEventMock.mockReset();
    trackExceptionMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a configured method's auth headers and omits cookies", async () => {
    getApiHeadersMock.mockResolvedValue({ Authorization: "Bearer test-token" });
    const fetchMock = stubFetch();

    await fetchIntunedApi(URL_BASE, { method: "POST", body: "{}" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        }),
        credentials: "omit",
      })
    );
  });

  it("relies on browser-injected cookies when there are no auth headers", async () => {
    getApiHeadersMock.mockResolvedValue(undefined);
    const fetchMock = stubFetch();

    await fetchIntunedApi(URL_BASE);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe("include");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("appends the method's auth query params to the URL", async () => {
    getApiHeadersMock.mockResolvedValue({ "x-api-key": "in1_key" });
    getApiQueryParamsMock.mockResolvedValue({ workspaceId: "ws-1" });
    const fetchMock = stubFetch();

    await fetchIntunedApi(URL_BASE);

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/api/selectors/create");
    expect(url.searchParams.get("workspaceId")).toBe("ws-1");
  });

  it("leaves the URL bare when there are no auth query params", async () => {
    const fetchMock = stubFetch();

    await fetchIntunedApi(URL_BASE);

    expect(new URL(fetchMock.mock.calls[0][0] as string).search).toBe("");
  });

  it("propagates the auth error and never fetches when signed out", async () => {
    getApiHeadersMock.mockRejectedValue(new Error("Not signed in"));
    const fetchMock = stubFetch();

    await expect(fetchIntunedApi(URL_BASE)).rejects.toThrow("Not signed in");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("emits an api.request event with host + path only, never the query string", async () => {
    getApiHeadersMock.mockResolvedValue({ "x-api-key": "in1_key" });
    getApiQueryParamsMock.mockResolvedValue({ workspaceId: "ws-secret" });
    stubFetch();

    await fetchIntunedApi(URL_BASE);

    expect(trackEventMock).toHaveBeenCalledTimes(1);
    const input = trackEventMock.mock.calls[0][0];
    expect(input.name).toBe("api.request");
    expect(input.properties).toMatchObject({
      host: "app.intuned.io",
      pathname: "/api/selectors/create",
      method: "GET",
      ok: "true",
      statusCode: "200",
    });
    // The workspace id rides in the query string; it must never be reported.
    expect(JSON.stringify(input)).not.toContain("ws-secret");
    expect(typeof input.measurements.durationMs).toBe("number");
    expect(trackExceptionMock).not.toHaveBeenCalled();
  });

  it("reports a network failure as an exception (not a success event) and rethrows", async () => {
    const failure = new TypeError("Failed to fetch");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw failure;
      })
    );

    await expect(fetchIntunedApi(URL_BASE)).rejects.toThrow("Failed to fetch");

    expect(trackEventMock).not.toHaveBeenCalled();
    expect(trackExceptionMock).toHaveBeenCalledTimes(1);
    const input = trackExceptionMock.mock.calls[0][0];
    expect(input.error).toBe(failure);
    expect(input.properties).toMatchObject({
      host: "app.intuned.io",
      pathname: "/api/selectors/create",
      context: "api.request",
    });
  });

  it("skips exception telemetry for a user-initiated abort (pre-aborted signal)", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("Aborted", "AbortError");
      })
    );

    await expect(
      fetchIntunedApi(URL_BASE, { signal: controller.signal })
    ).rejects.toThrow();

    expect(trackExceptionMock).not.toHaveBeenCalled();
  });

  it("skips exception telemetry when fetch throws an AbortError without a signal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("Aborted", "AbortError");
      })
    );

    await expect(fetchIntunedApi(URL_BASE)).rejects.toThrow();

    expect(trackExceptionMock).not.toHaveBeenCalled();
  });
});
