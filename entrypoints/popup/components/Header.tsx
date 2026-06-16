import type { AuthIdentity } from "@/lib/auth";
import type { SelectorCreationUsage } from "@/lib/graphql/usage";
import { getSettingsUrl } from "@/lib/config";
import styles from "../ui.module.css";
import { IntunedLogo, SettingsIcon } from "../icons";
import { UsageBar } from "./UsageBar";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

async function openSettings() {
  await browser.tabs.create({ url: await getSettingsUrl(), active: true });
  window.close();
}

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
        <div className={styles.headerActions}>
          <button
            id="open-settings"
            type="button"
            className={styles.iconBtn}
            title="Open Intuned settings"
            aria-label="Open Intuned settings"
            onClick={openSettings}
          >
            <SettingsIcon size={16} />
          </button>
          {authenticated && (
            <WorkspaceSwitcher identity={identity} onSignOut={onSignOut} />
          )}
        </div>
      </div>

      {authenticated && <UsageBar usage={usage} />}
    </header>
  );
}
