import { useEffect, useRef, useState, type ReactNode } from "react";
import type { StoryDefault } from "@ladle/react";
import type { SelectorHistoryEntry } from "@/lib/state";
import uiStyles from "@/entrypoints/popup/ui.module.css";
import { HistoryItem } from "@/entrypoints/popup/components/HistoryItem";
import {
  AlertIcon,
  ChevronDown,
  CopyIcon,
  LocateIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "@/entrypoints/popup/icons";
import { PopupFrame } from "../_popupFrame";
import { makeHistoryEntry } from "../_mocks";
import s from "./historyVariants.module.css";

export default {
  title: "Popup/HistoryItem Variants",
} satisfies StoryDefault;

/* ── mock data (newest first, like the real list) ────────────────────────── */

const iso = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const ENTRIES: SelectorHistoryEntry[] = [
  makeHistoryEntry({
    id: "e1",
    createdAt: iso(2),
    url: "https://github.com/intuned/webapp/pulls",
    selector: { type: "css", value: "a.js-issue-row[data-hovercard-type]" },
    matchCount: 1,
  }),
  makeHistoryEntry({
    id: "e2",
    createdAt: iso(190),
    url: "https://news.ycombinator.com/news",
    selector: { type: "xpath", value: "//tr[@class='athing']//span[@class='titleline']/a" },
    matchCount: 30,
  }),
  makeHistoryEntry({
    id: "e3",
    createdAt: iso(60 * 30),
    url: "https://shop.example.com/catalog/widgets",
    selector: { type: "css", value: "div.product-grid li.card a.product-card__title span.label" },
    matchCount: 1,
    feedback: "up",
  }),
  makeHistoryEntry({
    id: "e4",
    createdAt: iso(60 * 72),
    url: "https://app.example.io/dashboard",
    selector: { type: "css", value: "main .content .empty-state" },
    langsmithRunId: undefined, // fallback (generation failed)
    matchCount: 0,
  }),
];

/* ── tiny display helpers (mirrors HistoryItem; mocked for review) ────────── */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function whenOf(isoStr: string): string {
  const diffMin = Math.round((Date.now() - new Date(isoStr).getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const hr = Math.round(diffMin / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

const matchLabel = (n: number) => (n === 0 ? "0 matches" : `${n} match${n === 1 ? "" : "es"}`);

type Highlight = "bar" | "ring" | "tint" | null;
const highlightClass: Record<Exclude<Highlight, null>, string> = {
  bar: s.latestBar,
  ring: s.latestRing,
  tint: s.latestTint,
};

function Feedback({ value }: { value?: "up" | "down" }) {
  return (
    <span className={s.feedback}>
      <button type="button" className={s.fbBtn} style={value === "up" ? { color: "var(--ok)" } : undefined} aria-label="Good selector">
        <ThumbsUpIcon size={13} />
      </button>
      <button type="button" className={s.fbBtn} style={value === "down" ? { color: "var(--danger)" } : undefined} aria-label="Bad selector">
        <ThumbsDownIcon size={13} />
      </button>
    </span>
  );
}

/* ── the variant card ─────────────────────────────────────────────────────── */

function CompactItem({
  entry,
  variant,
  highlight = null,
}: {
  entry: SelectorHistoryEntry;
  variant: "A" | "B" | "C";
  highlight?: Highlight;
}) {
  const { type, value } = entry.selector;
  const host = hostOf(entry.url);
  const when = whenOf(entry.createdAt);
  const failed = !entry.langsmithRunId;
  const shell = cx(s.card, highlight && highlightClass[highlight]);

  // Reveal the full selector when it overflows its single line — click the
  // selector text or the chevron to wrap it into the panel below.
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const codeRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = codeRef.current;
    if (el) setTruncated(el.scrollWidth > el.clientWidth);
  }, [value]);

  const pill = highlight ? <span className={s.latestPill}>Latest</span> : null;
  const badge = <span className={s.badge}>{type.toUpperCase()}</span>;
  const selectorEl = (
    <code
      ref={codeRef}
      className={cx(variant === "C" ? s.selectorC : s.selector, truncated && s.selectorClickable)}
      title={value}
      onClick={truncated ? () => setExpanded((v) => !v) : undefined}
    >
      {value}
    </code>
  );
  const locate = (
    <button type="button" className={s.iconBtn} aria-label="Highlight on page">
      <LocateIcon size={13} />
    </button>
  );
  const copy = (
    <button type="button" className={s.iconBtn} aria-label="Copy selector">
      <CopyIcon size={12} />
    </button>
  );
  const expand = truncated ? (
    <button
      type="button"
      className={cx(s.iconBtn, s.chev, expanded && s.chevOpen)}
      aria-label={expanded ? "Hide full selector" : "Show full selector"}
      aria-expanded={expanded}
      onClick={() => setExpanded((v) => !v)}
    >
      <ChevronDown size={14} />
    </button>
  ) : null;
  const panel = truncated && expanded ? <code className={s.selectorPanel}>{value}</code> : null;

  const metaInfo: ReactNode = (
    <>
      {host && <span className={s.metaHost}>{host}</span>}
      {host && <span className={s.dot}>·</span>}
      <span>{when}</span>
      {!failed && entry.matchCount !== undefined && (
        <>
          <span className={s.dot}>·</span>
          <span>{matchLabel(entry.matchCount)}</span>
        </>
      )}
      {failed && (
        <>
          <span className={s.dot}>·</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--danger)" }}>
            <AlertIcon size={11} /> fallback
          </span>
        </>
      )}
    </>
  );

  if (variant === "A") {
    return (
      <div className={cx(shell, s.cardA)}>
        <div className={s.row}>
          {pill}
          {badge}
          {selectorEl}
          {locate}
          {copy}
          {expand}
        </div>
        <div className={s.meta}>
          {metaInfo}
          {!failed && <Feedback value={entry.feedback} />}
        </div>
        {panel}
      </div>
    );
  }

  if (variant === "B") {
    return (
      <div className={cx(shell, s.cardB)}>
        <div className={s.rowB} title={`${host ?? ""} · ${when}`}>
          {pill}
          {badge}
          {selectorEl}
          {!failed && entry.matchCount !== undefined && (
            <span className={s.matchInline}>{matchLabel(entry.matchCount)}</span>
          )}
          {failed && (
            <span className={s.matchInline} style={{ color: "var(--danger)" }}>fallback</span>
          )}
          {locate}
          {copy}
          {expand}
        </div>
        {panel}
      </div>
    );
  }

  // variant C — selector first
  return (
    <div className={cx(shell, s.cardC)}>
      <div className={s.row}>
        {selectorEl}
        {locate}
        {copy}
        {expand}
      </div>
      <div className={s.meta}>
        {pill}
        {badge}
        <span className={s.dot}>·</span>
        {metaInfo}
        {!failed && <Feedback value={entry.feedback} />}
      </div>
      {panel}
    </div>
  );
}

/* ── helpers to render lists ──────────────────────────────────────────────── */

function VariantList({ variant }: { variant: "A" | "B" | "C" }) {
  return (
    <div className={s.list}>
      {ENTRIES.map((e, i) => (
        <CompactItem key={e.id} entry={e} variant={variant} highlight={i === 0 ? "tint" : null} />
      ))}
    </div>
  );
}

/* ── stories ──────────────────────────────────────────────────────────────── */

export function Current() {
  return (
    <PopupFrame>
      <div className={uiStyles.content}>
        <div className={uiStyles.historyList}>
          {ENTRIES.map((e) => (
            <HistoryItem key={e.id} entry={e} />
          ))}
        </div>
      </div>
    </PopupFrame>
  );
}

export function CompactA_TwoRow() {
  return (
    <PopupFrame>
      <VariantList variant="A" />
    </PopupFrame>
  );
}

export function CompactB_OneRow() {
  return (
    <PopupFrame>
      <VariantList variant="B" />
    </PopupFrame>
  );
}

export function CompactC_SelectorFirst() {
  return (
    <PopupFrame>
      <VariantList variant="C" />
    </PopupFrame>
  );
}

export function LatestHighlightTreatments() {
  const treatments: { key: Exclude<Highlight, null>; label: string; sub: string }[] = [
    { key: "bar", label: "Bar", sub: "Left lime accent + tint" },
    { key: "ring", label: "Ring", sub: "Lime border + soft ring" },
    { key: "tint", label: "Tint", sub: "Lime tint only" },
  ];
  return (
    <div style={{ padding: 24, background: "#f4f4f6" }}>
      <div className={s.compareRow}>
        {treatments.map((t) => (
          <div key={t.key} className={s.compareCol}>
            <div className={s.compareLabel}>{t.label}</div>
            <div className={s.compareSub}>{t.sub}</div>
            <PopupFrame>
              <div className={s.list}>
                <CompactItem entry={ENTRIES[0]} variant="A" highlight={t.key} />
                <CompactItem entry={ENTRIES[1]} variant="A" />
              </div>
            </PopupFrame>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Comparison() {
  const cols: { label: string; sub: string; node: ReactNode }[] = [
    {
      label: "Current",
      sub: "3 rows / card",
      node: (
        <div className={uiStyles.content}>
          <div className={uiStyles.historyList}>
            {ENTRIES.map((e) => (
              <HistoryItem key={e.id} entry={e} />
            ))}
          </div>
        </div>
      ),
    },
    { label: "A — Two-row", sub: "selector + meta line", node: <VariantList variant="A" /> },
    { label: "B — One-row", sub: "densest; site in tooltip", node: <VariantList variant="B" /> },
    { label: "C — Selector-first", sub: "selector on top", node: <VariantList variant="C" /> },
  ];
  return (
    <div style={{ padding: 24, background: "#f4f4f6" }}>
      <div className={s.compareRow}>
        {cols.map((c) => (
          <div key={c.label} className={s.compareCol}>
            <div className={s.compareLabel}>{c.label}</div>
            <div className={s.compareSub}>{c.sub}</div>
            <PopupFrame>{c.node}</PopupFrame>
          </div>
        ))}
      </div>
    </div>
  );
}
