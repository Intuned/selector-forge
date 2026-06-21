import { useEffect, useState } from "react";
import { getTelemetryEnabled, setTelemetryEnabled } from "@/lib/config";
import styles from "../ui.module.css";

/**
 * Opt-out control for anonymous telemetry. Reads/writes the shared config flag
 * (browser.storage.local); the background client picks up the change live via a
 * storage.onChanged listener. Renders nothing until the current value loads.
 */
export function TelemetryToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void getTelemetryEnabled().then((value) => {
      if (active) setEnabled(value);
    });
    return () => {
      active = false;
    };
  }, []);

  if (enabled === null) return null;

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.checked;
    setEnabled(next);
    void setTelemetryEnabled(next);
  };

  return (
    <label
      className={styles.menuToggle}
      role="menuitemcheckbox"
      aria-checked={enabled}
    >
      <input
        id="telemetry-toggle"
        type="checkbox"
        checked={enabled}
        onChange={onChange}
      />
      <span>Share anonymous usage data</span>
    </label>
  );
}
