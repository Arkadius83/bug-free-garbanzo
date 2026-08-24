import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { discoverOllamaModels, generateCampaignDraft } from "./ollama.js";
import type { AiSettings, AssetKind, CreateReleaseDraftInput, DraftStatus, GenerateCampaignDraftInput, SaveGeneratedDraftInput, SystemStatus } from "../shared/contracts.js";
import { StudioDatabase } from "./database/database.js";
import { analyzeAudioFile } from "./audio-analysis.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
let studioDatabase: StudioDatabase;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#07090d",
    show: false,
    webPreferences: {
      preload: path.join(currentDirectory, "../preload/index.cjs"),
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

ipcMain.handle("studio:get-database-health", () => studioDatabase.health());
ipcMain.handle("studio:list-releases", () => studioDatabase.listReleases());
ipcMain.handle("studio:create-release-draft", (_event, input: CreateReleaseDraftInput) => studioDatabase.createReleaseDraft(input));
ipcMain.handle("studio:get-ai-settings", (): AiSettings => studioDatabase.getSetting("ai.settings", { model: null, language: "en", channel: "Instagram" }));
ipcMain.handle("studio:save-ai-settings", (_event, settings: AiSettings): AiSettings => {
  const safe: AiSettings = {
    model: typeof settings.model === "string" && settings.model.trim() ? settings.model : null,
    language: ["pl", "de", "en"].includes(settings.language) ? settings.language : "en",
    channel: ["Instagram", "Facebook", "TikTok", "SoundCloud", "YouTube"].includes(settings.channel) ? settings.channel : "Instagram"
  };
  studioDatabase.setSetting("ai.settings", safe);
  return safe;
});
ipcMain.handle("studio:generate-campaign-draft", (_event, input: GenerateCampaignDraftInput) => generateCampaignDraft(input));
ipcMain.handle("studio:list-drafts", (_event, releaseId?: string | null) => studioDatabase.listDrafts(releaseId));
ipcMain.handle("studio:save-generated-draft", (_event, input: SaveGeneratedDraftInput) => studioDatabase.saveGeneratedDraft(input));
ipcMain.handle("studio:update-draft-status", (_event, draftId: string, status: DraftStatus) => studioDatabase.updateDraftStatus(draftId, status));
ipcMain.handle("studio:list-assets", (_event, releaseId: string) => studioDatabase.listAssets(releaseId));
ipcMain.handle("studio:get-audio-analysis", (_event, assetId: string) => studioDatabase.getAudioAnalysis(assetId));
ipcMain.handle("studio:get-release-readiness", (_event, releaseId: string) => studioDatabase.getReleaseReadiness(releaseId));
ipcMain.handle("studio:analyze-audio", async (_event, assetId: string) => {
  const asset = studioDatabase.getAssetForAnalysis(assetId);
  if (!asset) throw new Error("Audio asset not found");
  if (asset.kind !== "audio") throw new Error("Only audio assets can be analyzed");
  return studioDatabase.saveAudioAnalysis(await analyzeAudioFile(asset.id, asset.filePath));
});
ipcMain.handle("studio:select-and-attach-asset", async (event, releaseId: string, kind: AssetKind) => {
  const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const filters = kind === "audio"
    ? [{ name: "Audio", extensions: ["wav", "mp3", "flac", "aiff", "aif", "m4a", "ogg"] }]
    : [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "tif", "tiff"] }];
  const result = owner ? await dialog.showOpenDialog(owner, { properties: ["openFile"], filters }) : await dialog.showOpenDialog({ properties: ["openFile"], filters });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const details = await stat(filePath);
  return studioDatabase.attachAsset({ releaseId, kind, filePath, fileName: path.basename(filePath), mimeType: inferMimeType(filePath), sizeBytes: details.size, modifiedAt: details.mtime.toISOString() });
});

function inferMimeType(filePath: string): string | null {
  const extension = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = { ".wav": "audio/wav", ".mp3": "audio/mpeg", ".flac": "audio/flac", ".aiff": "audio/aiff", ".aif": "audio/aiff", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".tif": "image/tiff", ".tiff": "image/tiff" };
  return types[extension] ?? null;
}

void app.whenReady().then(() => {
  studioDatabase = new StudioDatabase(path.join(app.getPath("userData"), "ai-studio-manager.sqlite"));
  studioDatabase.initialize();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => studioDatabase?.close());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
