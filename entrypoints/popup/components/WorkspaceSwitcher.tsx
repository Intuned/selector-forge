import { useRef, useState } from "react";
import type { AuthIdentity } from "@/lib/auth";
import styles from "../ui.module.css";
import { ChevronDown, SignOutIcon } from "../icons";
import { useClickOutside } from "../hooks/useClickOutside";
import { displayName, initials } from "../utils";

export function WorkspaceSwitcher({
  identity,
  onSignOut,
}: {
  identity: AuthIdentity | null;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = displayName(identity);

  useClickOutside(ref, open, () => setOpen(false));

  return (
    <div className={styles.workspace} ref={ref}>
      <button
        id="workspace-menu"
        type="button"
        className={styles.workspaceBtn}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {identity?.picture ? (
          <img className={styles.avatar} src={identity.picture} alt="" />
        ) : (
          <span className={styles.avatar} aria-hidden="true">
            {initials(name)}
          </span>
        )}
        <span className={styles.workspaceName}>
          {identity?.workspaceName ?? "Workspace"}
        </span>
        <ChevronDown size={13} className={styles.chevron} />
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.menuIdentity}>
            <span className={styles.menuName}>{name}</span>
          </div>
          <button
            id="sign-out"
            type="button"
            className={styles.signOutItem}
            role="menuitem"
            onClick={onSignOut}
          >
            <SignOutIcon size={15} />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}
