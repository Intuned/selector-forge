import { useCallback, useEffect, useRef, useState } from "react";
import type { SelectorFeedback, SelectorHistoryEntry } from "@/lib/state";
import { updateSelectorHistoryEntry } from "@/lib/state";
import { BackgroundMessageType } from "@/lib/messaging";
import styles from "../ui.module.css";
import {
  AlertIcon,
  CheckIcon,
  CopyIcon,
  LocateIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "../icons";
import { messagingClient } from "../messagingClient";

function matchLabel(count: number): string {
  if (count === 0) return "No matches";
  return `${count} ${count === 1 ? "match" : "matches"}`;
}

export function HistoryItem({ entry }: { entry: SelectorHistoryEntry }) {
  const { type, value } = entry.selector;
  const failed = !entry.langsmithRunId;
  const [copied, setCopied] = useState(false);
  const [located, setLocated] = useState<"idle" | "found" | "none">("idle");
  const [feedback, setFeedback] = useState<SelectorFeedback | undefined>(
    entry.feedback
  );
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();
  const locateTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(
    () => () => {
      clearTimeout(copyTimer.current);
      clearTimeout(locateTimer.current);
    },
    []
  );

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

  // Rate the selector. Clicking the active rating clears it; otherwise it
  // switches. We update + persist optimistically, then fire the message — a
  // failed send reverts to the prior rating so the UI never lies about what the
  // backend recorded. Gated on `entry.langsmithRunId` (older entries lack one).
  const rate = useCallback(
    async (next: SelectorFeedback) => {
      if (!entry.langsmithRunId) return;
      const prev = feedback;
      const value = feedback === next ? undefined : next;
      setFeedback(value);
      void updateSelectorHistoryEntry(entry.id, { feedback: value });
      if (!value) return; // cleared — nothing to send
      try {
        const { ok } = await messagingClient.sendMessageToBackground(
          BackgroundMessageType.SubmitSelectorFeedback,
          { langsmithRunId: entry.langsmithRunId, value }
        );
        if (!ok) throw new Error("feedback rejected");
      } catch {
        setFeedback(prev);
        void updateSelectorHistoryEntry(entry.id, { feedback: prev });
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

      {failed && (
        <p className={styles.failNote}>
          <AlertIcon size={12} />
          Couldn’t generate — using fallback.
        </p>
      )}

      <div className={styles.resultCardBottom}>
        <code className={`${styles.resultSelector} result-code`} title={value}>
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
      </div>
    </div>
  );
}
