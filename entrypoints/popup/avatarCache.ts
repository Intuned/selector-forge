/**
 * Cache-then-network for the user's avatar. The `picture` URL is already served
 * instantly from the snapshot cache, but the image bytes re-fetch on every open
 * and pop in late. Caching the decoded bytes as a data URL (keyed by URL) makes
 * a repeat open render with zero network. Best-effort: if the host blocks the
 * cross-origin byte fetch (CORS) it no-ops and the live URL is used. One entry
 * is kept, so storage stays bounded.
 */

const KEY = "selectorForge.avatar.v1";

interface CachedAvatar {
  url: string;
  dataUrl: string;
}

/** Cached data URL for `url`, or null when absent / for a different avatar. */
export function readCachedAvatar(url: string): string | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedAvatar>;
    return parsed?.url === url && typeof parsed.dataUrl === "string"
      ? parsed.dataUrl
      : null;
  } catch {
    return null;
  }
}

/** Fetch `url`, store its bytes as a data URL. No-ops on CORS/network/quota. */
export async function cacheAvatar(url: string): Promise<void> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return;
    const dataUrl = await blobToDataUrl(await res.blob());
    window.localStorage.setItem(KEY, JSON.stringify({ url, dataUrl }));
  } catch {
    /* host blocks cross-origin reads, or offline/quota — fall back to the URL. */
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
