import type { StudioApi } from "../shared/contracts.js";

const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

const api: StudioApi = {
  getSystemStatus: () => ipcRenderer.invoke("studio:get-system-status"),
  getDatabaseHealth: () => ipcRenderer.invoke("studio:get-database-health"),
  listReleases: () => ipcRenderer.invoke("studio:list-releases"),
  createReleaseDraft: (input) => ipcRenderer.invoke("studio:create-release-draft", input),
  getAiSettings: () => ipcRenderer.invoke("studio:get-ai-settings"),
  saveAiSettings: (settings) => ipcRenderer.invoke("studio:save-ai-settings", settings),
  generateCampaignDraft: (input) => ipcRenderer.invoke("studio:generate-campaign-draft", input),
  listDrafts: (releaseId) => ipcRenderer.invoke("studio:list-drafts", releaseId),
  saveGeneratedDraft: (input) => ipcRenderer.invoke("studio:save-generated-draft", input),
  updateDraftStatus: (draftId, status) => ipcRenderer.invoke("studio:update-draft-status", draftId, status),
  listAssets: (releaseId) => ipcRenderer.invoke("studio:list-assets", releaseId),
  selectAndAttachAsset: (releaseId, kind) => ipcRenderer.invoke("studio:select-and-attach-asset", releaseId, kind)
};

contextBridge.exposeInMainWorld("studio", api);
