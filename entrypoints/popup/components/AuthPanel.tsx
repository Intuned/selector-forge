import { useCallback, useState } from "react";
import type { AuthState } from "@/lib/auth";
import { BackgroundMessageType } from "@/lib/messaging";
import { getApiKeysUrl } from "@/lib/config";
import styles from "../ui.module.css";
import { KeyIcon, SignInIcon } from "../icons";
import { messagingClient } from "../messagingClient";

export function AuthPanel({
  authState,
  onAuthChange,
}: {
  authState: AuthState | null;
  onAuthChange: (s: AuthState) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(
    authState?.method === "api-key" && !!authState?.error
  );

  const lead =
    authState?.error && authState.method !== "api-key"
      ? authState.error
      : "Pick an element, get a reliable CSS or XPath selector.";

  const signIn = useCallback(() => {
    void messagingClient.sendMessageToBackground(
      BackgroundMessageType.SignIn,
      undefined as never
    );
  }, []);

  // Open the workspace's API-keys page so the user can create a key, then close
  // the popup (mirrors the header's settings link).
  const openApiKeys = useCallback(async () => {
    await browser.tabs.create({ url: await getApiKeysUrl(), active: true });
    window.close();
  }, []);

  const saveApiKey = useCallback(async () => {
    setError(null);
    const key = apiKey.trim();
    if (!key) {
      setError("Enter an API key.");
      return;
    }
    setSaving(true);
    try {
      const state = await messagingClient.sendMessageToBackground(
        BackgroundMessageType.SetApiKey,
        { apiKey: key }
      );
      setApiKey("");
      onAuthChange(state);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save API key.");
    } finally {
      setSaving(false);
    }
  }, [apiKey, onAuthChange]);

  return (
    <div className={styles.authPanel}>
      <div className={styles.authIntro}>
        <p className={styles.eyebrow}>Welcome</p>
        <h2 className={styles.authTitle}>Sign in to Selector Forge</h2>
        <p id="status" className={styles.authLead}>
          {lead}
        </p>
      </div>

      <div className={styles.authActions}>
        <button
          id="signin-btn"
          type="button"
          className={`${styles.btnPrimary} ${styles.btnBlock}`}
          onClick={signIn}
        >
          <SignInIcon size={15} /> Sign in with browser
        </button>

        {!showApiKey ? (
          <button
            type="button"
            className={`${styles.btnGhost} ${styles.btnBlock}`}
            aria-expanded={false}
            onClick={() => setShowApiKey(true)}
          >
            <KeyIcon size={14} /> Use an API key
          </button>
        ) : (
          <div className={styles.auth}>
            <div className={styles.authDivider}>
              <span>or use an API key</span>
            </div>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>API key</span>
              <input
                id="api-key-input"
                className={styles.input}
                type="password"
                autoComplete="off"
                placeholder="in1_…"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </label>
            <button
              id="create-api-key"
              type="button"
              className={styles.link}
              onClick={openApiKeys}
            >
              Don’t have an API key? Create one →
            </button>
            {error && (
              <p id="api-key-error" className={styles.errorText}>
                {error}
              </p>
            )}
            <div className={styles.authKeyActions}>
              <button
                type="button"
                className={styles.authCancel}
                aria-expanded
                onClick={() => setShowApiKey(false)}
              >
                Cancel
              </button>
              <button
                id="api-key-save"
                type="button"
                className={styles.btnPrimary}
                onClick={saveApiKey}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        id="signin-retry"
        type="button"
        className={styles.retryLink}
        onClick={() =>
          void messagingClient
            .sendMessageToBackground(
              BackgroundMessageType.BootstrapPopup,
              undefined as never
            )
            .then((s) => onAuthChange(s.auth))
        }
      >
        I’ve signed in — retry
      </button>
    </div>
  );
}
