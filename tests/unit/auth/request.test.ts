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
});
