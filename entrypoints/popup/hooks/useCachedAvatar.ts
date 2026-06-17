import { useEffect, useState } from "react";
import { cacheAvatar, readCachedAvatar } from "../avatarCache";

/**
 * Resolve an avatar URL to a renderable `src`, cache-then-network: returns the
 * cached data URL synchronously when available (no flash), otherwise the live
 * URL while the bytes are fetched and cached for the next open. Returns
 * `undefined` when there's no picture, so callers fall back to initials.
 */
export function useCachedAvatar(url: string | undefined): string | undefined {
  const [src, setSrc] = useState<string | undefined>(() =>
    url ? readCachedAvatar(url) ?? url : undefined
  );

  useEffect(() => {
    if (!url) {
      setSrc(undefined);
      return;
    }
    const cached = readCachedAvatar(url);
    if (cached) {
      setSrc(cached); // cache hit — done, no network
      return;
    }
    setSrc(url); // miss — render the live URL now...
    let active = true;
    void cacheAvatar(url).then(() => {
      // ...then swap to the cached bytes once stored (for this and next opens).
      const stored = readCachedAvatar(url);
      if (active && stored) setSrc(stored);
    });
    return () => {
      active = false;
    };
  }, [url]);

  return src;
}
