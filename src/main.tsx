import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./audio-analysis.css";
import "./tasks.css";
import "./integrations.css";
import "./audio-player.css";
import "./analytics.css";
import "./crm.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
