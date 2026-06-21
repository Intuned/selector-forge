import type { CSSProperties, ReactNode } from "react";

/**
 * Renders children inside a frame matching the real extension popup: 350px wide
 * (see `body` in `ui.module.css`), white, rounded, on a neutral canvas. Use it
 * to preview popup components at their true size. Pass `fill` for full-popup
 * compositions that should reserve the popup's 440px min height.
 */
export function PopupFrame({
  children,
  fill = false,
}: {
  children: ReactNode;
  fill?: boolean;
}) {
  const frame: CSSProperties = {
    width: 350,
    minHeight: fill ? 440 : undefined,
    background: "#ffffff",
    borderRadius: 12,
    border: "1px solid #ebebee",
    boxShadow: "0 8px 30px rgba(0, 0, 0, 0.12)",
    overflow: "hidden",
  };
  return (
    <div style={{ padding: 24, background: "#f4f4f6", display: "inline-block" }}>
      <div style={frame}>{children}</div>
    </div>
  );
}
