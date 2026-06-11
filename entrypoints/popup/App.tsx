import styles from "./ui.module.css";
import { Body } from "./components/Body";
import { Header } from "./components/Header";
import { usePopupState } from "./hooks/usePopupState";

export function App() {
  const {
    auth,
    session,
    selectorGenerationError,
    bootstrapError,
    mode,
    history,
    usage,
    showPicker,
    chipState,
    authenticated,
    setAuth,
    setMode,
    bootstrap,
    signOut,
    startSession,
    startNew,
    openPicker,
    cancelSession,
  } = usePopupState();

  return (
    <div className={styles.app}>
      {/* test marker — drives e2e auth assertions. */}
      <span id="auth-state" data-state={chipState} hidden />

      <Header
        authenticated={authenticated}
        identity={auth?.identity ?? null}
        usage={usage}
        onSignOut={signOut}
      />

      <Body
        loading={!auth && !bootstrapError} // loading is reflected from the absence of auth or an error
        bootstrapError={bootstrapError}
        authState={auth}
        session={session}
        selectorGenerationError={selectorGenerationError}
        history={history}
        showPicker={showPicker} // which tab to show: history, or picker
        mode={mode}
        onModeChange={setMode}
        onPick={startSession}
        onNew={startNew}
        onOpenPicker={openPicker}
        onCancel={cancelSession}
        onRetry={bootstrap}
        onAuthChange={setAuth}
      />
    </div>
  );
}
