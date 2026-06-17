import { useCallback, useEffect, useRef, useState } from "react";
import type { SelectorFeedback, SelectorHistoryEntry } from "@/lib/state";
import { BackgroundMessageType } from "@/lib/messaging";
import styles from "../ui.module.css";
import {
  AlertIcon,
  CheckIcon,
  ChevronDown,
  CopyIcon,
  LocateIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "../icons";
import { messagingClient } from "../messagingClient";

function matchLabel(count: number): string {
  if (count === 0) return "No matches";
  return `Matches ${count} ${count === 1 ? "element" : "elements"}`;
}

// The site the selector was created on, sans a noisy leading `www.`; null when
// the stored url won't parse.
function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Compact relative age ("2h ago"), falling back to an absolute date past a week.
// `title` carries the full local timestamp so the exact value is available on hover.
function formatWhen(iso: string): { label: string; title: string } {
  const then = new Date(iso);
  const title = then.toLocaleString();
  const diffSec = Math.round((Date.now() - then.getTime()) / 1000);
  if (diffSec < 60) return { label: "just now", title };
  const min = Math.round(diffSec / 60);
  if (min < 60) return { label: `${min}m ago`, title };
  const hr = Math.round(min / 60);
  if (hr < 24) return { label: `${hr}h ago`, title };
  const day = Math.round(hr / 24);
  if (day < 7) return { label: `${day}d ago`, title };
  return { label: then.toLocaleDateString(), title };
}

export function HistoryItem({ entry }: { entry: SelectorHistoryEntry }) {
  const { type, value } = entry.selector;
  const failed = !entry.langsmithRunId;
  const [copied, setCopied] = useState(false);
  const [located, setLocated] = useState<"idle" | "found" | "none">("idle");
  const [feedback, setFeedback] = useState<SelectorFeedback | undefined>(
    entry.feedback
  );
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const codeRef = useRef<HTMLElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();
  const locateTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(
    () => () => {
      clearTimeout(copyTimer.current);
      clearTimeout(locateTimer.current);
    },
    []
  );

  // Offer "show full" only when the selector overflows its single line. The
  // inline row stays truncated even when expanded (the full value shows in the
  // panel below), so this measurement is stable.
  useEffect(() => {
    const el = codeRef.current;
    if (el) setTruncated(el.scrollWidth > el.clientWidth);
  }, [value]);

  const host = hostFromUrl(entry.url);
  const when = formatWhen(entry.createdAt);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return; /* clipboard may be blocked; leave state untouched */
    }
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1200);
  }, [value]);

  // Highlight the selector on the active tab. The locate button's found/none
  // state reflects the live page (the user may be on a different page than the
  // one the selector was created on); the badge keeps the stored match count.
  const locate = useCallback(async () => {
    let found = false;
    try {
      const { matchCount } = await messagingClient.sendMessageToBackground(
        BackgroundMessageType.HighlightSelector,
        { selector: { type, value } }
      );
      found = matchCount > 0;
    } catch {
      /* unreachable tab — treat as not found */
    }
    setLocated(found ? "found" : "none");
    clearTimeout(locateTimer.current);
    locateTimer.current = setTimeout(() => setLocated("idle"), 1400);
  }, [type, value]);

  // Rate the selector: clicking the active rating clears it, else switches.
  // Optimistic UI, then the background persists + forwards the rating; a failed
  // send reverts so the UI never lies about what was recorded. Gated on
  // `entry.langsmithRunId` (older entries lack one).
  const rate = useCallback(
    async (next: SelectorFeedback) => {
      if (!entry.langsmithRunId) return;
      const prev = feedback;
      const value = feedback === next ? undefined : next;
      setFeedback(value);
      try {
        const { ok } = await messagingClient.sendMessageToBackground(
          BackgroundMessageType.SubmitSelectorFeedback,
          {
            entryId: entry.id,
            langsmithRunId: entry.langsmithRunId,
            value: value ?? null,
          }
        );
        if (!ok) throw new Error("feedback rejected");
      } catch {
        setFeedback(prev);
      }
    },
    [entry.id, entry.langsmithRunId, feedback]
  );

  return (
    <div className={styles.resultCard}>
      <div className={styles.resultCardTop}>
        <div className={styles.resultIdentity}>
          <span
            className={`${styles.typeBadge} ${
              type === "css" ? styles.typeBadgeCss : styles.typeBadgeXpath
            }`}
          >
            {type.toUpperCase()}
          </span>
          {entry.matchCount !== undefined && (
            <span className={styles.matchCount}>
              {matchLabel(entry.matchCount)}
            </span>
          )}
        </div>

        {entry.langsmithRunId && (
          <div className={styles.feedbackActions}>
            <button
              type="button"
              className={`${styles.feedbackBtn} ${
                feedback === "up" ? styles.feedbackBtnUp : ""
              }`}
              title="Good selector"
              aria-label="Good selector"
              aria-pressed={feedback === "up"}
              onClick={() => rate("up")}
            >
              <ThumbsUpIcon size={14} />
            </button>
            <button
              type="button"
              className={`${styles.feedbackBtn} ${
                feedback === "down" ? styles.feedbackBtnDown : ""
              }`}
              title="Bad selector"
              aria-label="Bad selector"
              aria-pressed={feedback === "down"}
              onClick={() => rate("down")}
            >
              <ThumbsDownIcon size={14} />
            </button>
          </div>
        )}
      </div>

      <div className={styles.resultMeta}>
        {host && (
          <span className={styles.resultHost} title={entry.url}>
            {host}
          </span>
        )}
        {host && (
          <span className={styles.resultMetaDot} aria-hidden="true">
            ·
          </span>
        )}
        <span title={when.title}>{when.label}</span>
      </div>

      {failed && (
        <p className={styles.failNote}>
          <AlertIcon size={12} />
          Couldn’t generate — using fallback.
        </p>
      )}

      <div className={styles.resultCardBottom}>
        <code
          ref={codeRef}
          className={`${styles.resultSelector} ${
            truncated ? styles.resultSelectorClickable : ""
          } result-code`}
          title={value}
          onClick={truncated ? () => setExpanded((v) => !v) : undefined}
        >
          {value}
        </code>
        <button
          type="button"
          className={`${styles.locateBtn} ${
            located === "found" ? styles.locateBtnFound : ""
          } ${located === "none" ? styles.locateBtnMiss : ""}`}
          title={
            located === "none" ? "Not found on this page" : "Highlight on page"
          }
          aria-label="Highlight on page"
          onClick={locate}
        >
          <LocateIcon size={13} />
        </button>
        <button
          type="button"
          className={`${styles.copyBtn} ${copied ? styles.copyBtnDone : ""}`}
          title={copied ? "Copied" : "Copy selector"}
          aria-label="Copy selector"
          onClick={copy}
        >
          {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
        {truncated && (
          <button
            type="button"
            className={`${styles.expandBtn} ${
              expanded ? styles.expandBtnOpen : ""
            }`}
            title={expanded ? "Hide full selector" : "Show full selector"}
            aria-label={expanded ? "Hide full selector" : "Show full selector"}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronDown size={14} />
          </button>
        )}
      </div>

      {truncated && expanded && (
        <code className={styles.resultSelectorPanel}>{value}</code>
      )}
    </div>
  );
}
