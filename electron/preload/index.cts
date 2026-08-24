import type { StudioApi } from "../shared/contracts.js";

const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

const api: StudioApi = {
  getSystemStatus: () => ipcRenderer.invoke("studio:get-system-status"),
  getDatabaseHealth: () => ipcRenderer.invoke("studio:get-database-health"),
  listReleases: () => ipcRenderer.invoke("studio:list-releases"),
  createReleaseDraft: (input) => ipcRenderer.invoke("studio:create-release-draft", input),
  getAiSettings: () => ipcRenderer.invoke("studio:get-ai-settings"),
  saveAiSettings: (settings) => ipcRenderer.invoke("studio:save-ai-settings", settings),
  generateCampaignDraft: (input) => ipcRenderer.invoke("studio:generate-campaign-draft", input)
};

contextBridge.exposeInMainWorld("studio", api);
