import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { discoverOllamaModels } from "./ollama.js";
import type { SystemStatus } from "../shared/contracts.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#07090d",
    show: false,
    webPreferences: {
      preload: path.join(currentDirectory, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.once("ready-to-show", () => window.show());

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(currentDirectory, "../../dist/index.html"));
  }
}

ipcMain.handle("studio:get-system-status", async (): Promise<SystemStatus> => {
  try {
    const models = await discoverOllamaModels();
    return {
      appVersion: app.getVersion(),
      platform: process.platform,
      ollama: { available: true, models }
    };
  } catch (error) {
    return {
      appVersion: app.getVersion(),
      platform: process.platform,
      ollama: {
        available: false,
        models: [],
        error: error instanceof Error ? error.message : "Unknown Ollama error"
      }
    };
  }
});

void app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
