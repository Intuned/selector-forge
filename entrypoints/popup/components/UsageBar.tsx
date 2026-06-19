import type { SelectorCreationUsage } from "@/lib/graphql/usage";
import styles from "../ui.module.css";

export function UsageBar({ usage }: { usage: SelectorCreationUsage | null }) {
  const loading = usage === null;
  const pct =
    usage && usage.included > 0
      ? Math.min(100, Math.round((usage.used / usage.included) * 100))
      : 0;
  return (
    <div className={styles.usage}>
      <div className={styles.usageRow}>
        <span className={styles.usageLabel}>Selectors this month</span>
        <span className={styles.usageCount}>
          {loading ? (
            <span className={styles.usageSkeleton} aria-hidden="true" />
          ) : (
            <>
              {usage.used} <em>/ {usage.included}</em>
            </>
          )}
        </span>
      </div>
      <div className={`${styles.track} ${loading ? styles.trackLoading : ""}`}>
        {!loading && (
          <div className={styles.fill} style={{ width: `${pct}%` }} />
        )}
      </div>
    </div>
  );
}
