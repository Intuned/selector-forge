import { useEffect, type RefObject } from "react";

// Close-on-outside-click. No-op while `active` is false so the listener only
// lives for as long as the menu/popover is open.
export function useClickOutside(
  ref: RefObject<HTMLElement>,
  active: boolean,
  onOutside: () => void
) {
  useEffect(() => {
    if (!active) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [ref, active, onOutside]);
}
