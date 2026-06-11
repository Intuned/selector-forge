import type { AuthIdentity } from "@/lib/auth";
import type { SelectorCreationUsage } from "@/lib/graphql/usage";
import styles from "../ui.module.css";
import { IntunedLogo } from "../icons";
import { UsageBar } from "./UsageBar";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

export function Header({
  authenticated,
  identity,
  usage,
  onSignOut,
}: {
  authenticated: boolean;
  identity: AuthIdentity | null;
  usage: SelectorCreationUsage | null;
  onSignOut: () => void;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headerTop}>
        <div className={styles.brand}>
          <IntunedLogo className={styles.logo} />
          <span className={styles.brandName}>Selector</span>
        </div>
        {authenticated && (
          <WorkspaceSwitcher identity={identity} onSignOut={onSignOut} />
        )}
      </div>

      {authenticated && <UsageBar usage={usage} />}
    </header>
  );
}
