const DEFAULT_API_BASE = "http://localhost:3000";
export const GRAPHQL_API = "http://localhost:8080/v1/graphql";
const API_BASE_OVERRIDE_KEY = "config.apiBase";

export async function getApiBase(): Promise<string> {
  const out = await browser.storage.local.get(API_BASE_OVERRIDE_KEY);
  const value = out[API_BASE_OVERRIDE_KEY];
  return typeof value === "string" && value ? value : DEFAULT_API_BASE;
}

export async function setApiBaseOverride(url: string | null): Promise<void> {
  if (url) {
    await browser.storage.local.set({ [API_BASE_OVERRIDE_KEY]: url });
  } else {
    await browser.storage.local.remove(API_BASE_OVERRIDE_KEY);
  }
}

export async function getSelectorCreateUrl(): Promise<string> {
  const apiBase = await getApiBase();
  return `${apiBase}/api/selectors/create`;
}

export async function getSelectorFeedbackUrl(): Promise<string> {
  const apiBase = await getApiBase();
  return `${apiBase}/api/selectors/feedback`;
}
