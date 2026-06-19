import "./wxt-globals"; // must run before any story (installs the `browser` stub)
import "./ladle.css";
import type { GlobalProvider } from "@ladle/react";

// Passthrough provider. Its only job is to register this file with Ladle so the
// side-effect imports above (browser stub + global CSS reset) load as part of
// the app shell.
export const Provider: GlobalProvider = ({ children }) => <>{children}</>;
