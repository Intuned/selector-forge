import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./ui.module.css";
import { setTelemetrySink, trackException } from "@/lib/telemetry/api";
import { createForwardingSink } from "@/lib/telemetry/forwardingSink";
import { reportGlobalErrors } from "@/lib/telemetry/globalErrors";

// The popup is its own extension window — its error events are all ours (no host
// page), so no filtering is needed. Forward telemetry to the background egress.
setTelemetrySink(createForwardingSink("selector-extension-popup"));
reportGlobalErrors(window);

/** Reports render-time crashes to telemetry and shows a minimal fallback. */
class TelemetryErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    trackException({ error, properties: { source: "errorBoundary" } });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, fontSize: 13 }}>
          Something went wrong. Please reopen the popup.
        </div>
      );
    }
    return this.props.children;
  }
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root in popup");
createRoot(container).render(
  <TelemetryErrorBoundary>
    <App />
  </TelemetryErrorBoundary>
);
