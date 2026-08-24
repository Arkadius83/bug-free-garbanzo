import type { StudioApi } from "../shared/contracts.js";

const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

const api: StudioApi = {
  getSystemStatus: () => ipcRenderer.invoke("studio:get-system-status"),
  getDatabaseHealth: () => ipcRenderer.invoke("studio:get-database-health"),
  listReleases: () => ipcRenderer.invoke("studio:list-releases"),
  createReleaseDraft: (input) => ipcRenderer.invoke("studio:create-release-draft", input),
  updateRelease: (input) => ipcRenderer.invoke("studio:update-release", input),
  deleteRelease: (releaseId) => ipcRenderer.invoke("studio:delete-release", releaseId),
  getAiSettings: () => ipcRenderer.invoke("studio:get-ai-settings"),
  saveAiSettings: (settings) => ipcRenderer.invoke("studio:save-ai-settings", settings),
  generateCampaignDraft: (input) => ipcRenderer.invoke("studio:generate-campaign-draft", input),
  listDrafts: (releaseId) => ipcRenderer.invoke("studio:list-drafts", releaseId),
  saveGeneratedDraft: (input) => ipcRenderer.invoke("studio:save-generated-draft", input),
  updateDraftStatus: (draftId, status) => ipcRenderer.invoke("studio:update-draft-status", draftId, status),
  listAssets: (releaseId) => ipcRenderer.invoke("studio:list-assets", releaseId),
  selectAndAttachAsset: (releaseId, kind) => ipcRenderer.invoke("studio:select-and-attach-asset", releaseId, kind),
  detachAsset: (assetId) => ipcRenderer.invoke("studio:detach-asset", assetId),
  getAudioAnalysis: (assetId) => ipcRenderer.invoke("studio:get-audio-analysis", assetId),
  analyzeAudio: (assetId) => ipcRenderer.invoke("studio:analyze-audio", assetId),
  getReleaseReadiness: (releaseId) => ipcRenderer.invoke("studio:get-release-readiness", releaseId),
  listTasks: (releaseId) => ipcRenderer.invoke("studio:list-tasks", releaseId),
  createTask: (input) => ipcRenderer.invoke("studio:create-task", input),
  updateTaskStatus: (taskId, status) => ipcRenderer.invoke("studio:update-task-status", taskId, status),
  runTaskAgent: (taskId, model) => ipcRenderer.invoke("studio:run-task-agent", taskId, model),
  getSoundCloudConnection: () => ipcRenderer.invoke("studio:get-soundcloud-connection"),
  saveSoundCloudCredentials: (clientId, clientSecret) => ipcRenderer.invoke("studio:save-soundcloud-credentials", clientId, clientSecret),
  beginSoundCloudConnect: () => ipcRenderer.invoke("studio:begin-soundcloud-connect"),
  disconnectSoundCloud: () => ipcRenderer.invoke("studio:disconnect-soundcloud"),
  syncSoundCloudCatalog: () => ipcRenderer.invoke("studio:sync-soundcloud-catalog"),
  listSoundCloudTracks: () => ipcRenderer.invoke("studio:list-soundcloud-tracks"),
  updateSoundCloudTrack: (input) => ipcRenderer.invoke("studio:update-soundcloud-track", input),
  setSoundCloudTracksContentType: (ids, contentType) => ipcRenderer.invoke("studio:set-soundcloud-tracks-content-type", ids, contentType),
  linkSoundCloudTrack: (trackId, releaseId) => ipcRenderer.invoke("studio:link-soundcloud-track", trackId, releaseId),
  getSoundCloudTrackPerformance: (trackId) => ipcRenderer.invoke("studio:get-soundcloud-track-performance", trackId)
};

contextBridge.exposeInMainWorld("studio", api);
