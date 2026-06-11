import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./ui.module.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root in popup");
createRoot(container).render(<App />);
