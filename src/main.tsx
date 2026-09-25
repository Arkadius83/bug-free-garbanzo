import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./ui/ui-shell.css";
import "./styles.css";
import "./audio-analysis.css";
import "./tasks.css";
import "./integrations.css";
import "./audio-player.css";
import "./analytics.css";
import "./crm.css";
import "./harness-plan.css";
import "./features/settings/settings.css";
import "./features/publishing/publishing.css";
import "./ui/v4-foundation.css";
import "./features/releases/releases-v4.css";
import "./features/ai-studio/ai-studio.css";
import "./features/content-calendar/content-calendar-v4.css";
import "./analytics-v4.css";
import "./features/publishing/publishing-v4.css";
import "./crm-v4.css";
import "./features/settings/settings-v4.css";
import "./harness-plan-v4.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
