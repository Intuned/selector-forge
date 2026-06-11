import { useCallback, useEffect, useRef, useState } from "react";
import type { SelectorFeedback, SelectorHistoryEntry } from "@/lib/state";
import { updateSelectorHistoryEntry } from "@/lib/state";
import { BackgroundMessageType } from "@/lib/messaging";
import styles from "../ui.module.css";
import {
  CheckIcon,
  ChevronDown,
  CopyIcon,
  LocateIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "../icons";
import { messagingClient } from "../messagingClient";
import { domainOf, timeAgo } from "../utils";

export function HistoryItem({
  entry,
  expanded,
  onToggle,
}: {
  entry: SelectorHistoryEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [type, setType] = useState<"css" | "xpath">(
    entry.css ? "css" : "xpath"
  );
  const [headerCopied, setHeaderCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [located, setLocated] = useState<"idle" | "found" | "none">("idle");
  const [feedback, setFeedback] = useState<SelectorFeedback | undefined>(
    entry.feedback
  );
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const codeTimer = useRef<ReturnType<typeof setTimeout>>();
  const locateTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(codeTimer.current);
      clearTimeout(locateTimer.current);
    },
    []
  );

  // Collapsed preview + quick-copy prefer CSS; the toggle drives the expanded
  // value.
  const previewValue = entry.css ?? entry.xpath ?? "";
  const shownValue = (type === "css" ? entry.css : entry.xpath) ?? "";

  // The header and the expanded code box each get their own copied state +
  // timer so triggering one never animates the other.
  const copy = useCallback(async (value: string, target: "header" | "code") => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return; /* clipboard may be blocked; leave state untouched */
    }
    const setCopied = target === "header" ? setHeaderCopied : setCodeCopied;
    const ref = target === "header" ? timer : codeTimer;
    setCopied(true);
    clearTimeout(ref.current);
    ref.current = setTimeout(() => setCopied(false), 1200);
  }, []);

  // Highlight the selector on the active tab. Feedback reflects whether it
  // matched anything there (the user may be on a different page than the one
  // the selector was created on).
  const locate = useCallback(
    async (value: string, kind: "css" | "xpath") => {
      if (!value) return;
      let found = false;
      try {
        const { matchCount } = await messagingClient.sendMessageToBackground(
          BackgroundMessageType.HighlightSelector,
          { selector: { type: kind, value } }
        );
        found = matchCount > 0;
      } catch {
        /* unreachable tab — treat as not found */
      }
      setLocated(found ? "found" : "none");
      clearTimeout(locateTimer.current);
      locateTimer.current = setTimeout(() => setLocated("idle"), 1400);
    },
    []
  );

  // Rate the selector. Clicking the active rating clears it; otherwise it
  // switches. We update + persist optimistically, then fire the message — a
  // failed send reverts to the prior rating so the UI never lies about what the
  // backend recorded. Gated on `entry.langsmithRunId` (older entries lack one).
  const rate = useCallback(
    async (value: SelectorFeedback) => {
      if (!entry.langsmithRunId) return;
      const prev = feedback;
      const next = feedback === value ? undefined : value;
      setFeedback(next);
      void updateSelectorHistoryEntry(entry.id, { feedback: next });
      if (!next) return; // cleared — nothing to send
      try {
        const { ok } = await messagingClient.sendMessageToBackground(
          BackgroundMessageType.SubmitSelectorFeedback,
          { langsmithRunId: entry.langsmithRunId, value: next }
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
    <div
      className={`${styles.historyItem} ${
        expanded ? styles.historyItemOpen : ""
      }`}
    >
      <div className={styles.historyRow}>
        <button
          type="button"
          className={styles.historyMain}
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span className={styles.historySelector}>{previewValue}</span>
          <span className={styles.historyMeta}>
            {domainOf(entry.url)} · {timeAgo(entry.createdAt)}
          </span>
        </button>
        <div className={styles.historyActions}>
          <button
            type="button"
            className={styles.iconBtn}
            title="Copy selector"
            aria-label="Copy selector"
            onClick={() => copy(previewValue, "header")}
          >
            {headerCopied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            title={expanded ? "Collapse" : "Expand"}
            aria-label={expanded ? "Collapse" : "Expand"}
            onClick={onToggle}
          >
            <ChevronDown
              size={12}
              className={`${styles.historyChevron} ${
                expanded ? styles.historyChevronOpen : ""
              }`}
            />
          </button>
        </div>
      </div>

      {expanded && (
        <div className={styles.historyExpand}>
          <div className={styles.segmented} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={type === "css"}
              className={`${styles.segBtn} ${
                type === "css" ? styles.segBtnActive : ""
              }`}
              disabled={!entry.css}
              onClick={() => setType("css")}
            >
              CSS
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={type === "xpath"}
              className={`${styles.segBtn} ${
                type === "xpath" ? styles.segBtnActive : ""
              }`}
              disabled={!entry.xpath}
              onClick={() => setType("xpath")}
            >
              XPath
            </button>
          </div>
          <div className={styles.codeWrap}>
            <code
              className={`${styles.codeBox} result-code`}
              title={`${type}: ${shownValue}`}
            >
              {shownValue}
            </code>
            <div className={styles.codeActions}>
              <button
                type="button"
                className={`${styles.codeBtn} ${
                  located === "found" ? styles.codeBtnFound : ""
                } ${located === "none" ? styles.codeBtnMiss : ""}`}
                title={
                  located === "none"
                    ? "Not found on this page"
                    : "Highlight on page"
                }
                aria-label="Highlight on page"
                onClick={() => locate(shownValue, type)}
                disabled={!shownValue}
              >
                <LocateIcon size={14} />
              </button>
              <button
                type="button"
                className={`${styles.codeBtn} ${
                  codeCopied ? styles.codeBtnDone : ""
                }`}
                title={codeCopied ? "Copied" : "Copy selector"}
                aria-label="Copy selector"
                onClick={() => copy(shownValue, "code")}
                disabled={!shownValue}
              >
                {codeCopied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
              </button>
            </div>
          </div>

          {entry.langsmithRunId && (
            <div className={styles.feedbackRow}>
              <span className={styles.feedbackLabel}>
                Was this selector helpful?
              </span>
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
