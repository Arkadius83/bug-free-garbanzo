import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { discoverOllamaModels, generateCampaignDraft, runPlanningAgent } from "./ollama.js";
import type { AiSettings, AssetKind, CreateReleaseDraftInput, CreateTaskInput, DraftStatus, GenerateCampaignDraftInput, SaveGeneratedDraftInput, SystemStatus, TaskStatus, UpdateReleaseInput, UpdateSoundCloudTrackInput } from "../shared/contracts.js";
import { StudioDatabase } from "./database/database.js";
import { analyzeAudioFile } from "./audio-analysis.js";
import { SoundCloudClient } from "./soundcloud.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
let studioDatabase: StudioDatabase;
let soundCloudClient: SoundCloudClient;
if (!app.requestSingleInstanceLock()) app.quit();

function soundCloudCallbackFromArgs(args: string[]): string | null {
  return args.find((value) => value.startsWith("ai-studio-manager://soundcloud/callback")) ?? null;
}

async function handleSoundCloudCallback(url: string): Promise<void> {
  try { await soundCloudClient.handleCallback(url); }
  catch (error) { console.error("SoundCloud callback failed", error); }
  const window = BrowserWindow.getAllWindows()[0];
  if (window) { if (window.isMinimized()) window.restore(); window.focus(); }
}

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
ipcMain.handle("studio:update-release", (_event, input: UpdateReleaseInput) => studioDatabase.updateRelease(input));
ipcMain.handle("studio:delete-release", (_event, releaseId: string) => studioDatabase.deleteRelease(releaseId));
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
ipcMain.handle("studio:detach-asset", (_event, assetId: string) => studioDatabase.detachAsset(assetId));
ipcMain.handle("studio:get-audio-analysis", (_event, assetId: string) => studioDatabase.getAudioAnalysis(assetId));
ipcMain.handle("studio:get-release-readiness", (_event, releaseId: string) => studioDatabase.getReleaseReadiness(releaseId));
ipcMain.handle("studio:list-tasks", (_event, releaseId?: string | null) => studioDatabase.listTasks(releaseId));
ipcMain.handle("studio:create-task", (_event, input: CreateTaskInput) => studioDatabase.createTask(input));
ipcMain.handle("studio:update-task-status", (_event, taskId: string, taskStatus: TaskStatus) => studioDatabase.updateTaskStatus(taskId, taskStatus));
ipcMain.handle("studio:run-task-agent", async (_event, taskId: string, model: string) => {
  const task = studioDatabase.listTasks().find((item) => item.id === taskId);
  if (!task) throw new Error("Task not found");
  if (task.assignee !== "ai") throw new Error("Only AI Agent tasks can be run by a model");
  const output = await runPlanningAgent(model, task.title, task.releaseTitle);
  return studioDatabase.saveTaskAgentOutput(taskId, model, output);
});
ipcMain.handle("studio:get-soundcloud-connection", () => soundCloudClient.status());
ipcMain.handle("studio:save-soundcloud-credentials", (_event, clientId: string, clientSecret: string) => soundCloudClient.saveCredentials(clientId, clientSecret));
ipcMain.handle("studio:begin-soundcloud-connect", () => soundCloudClient.beginConnect());
ipcMain.handle("studio:disconnect-soundcloud", () => soundCloudClient.disconnect());
ipcMain.handle("studio:sync-soundcloud-catalog", async () => studioDatabase.importSoundCloudTracks(await soundCloudClient.fetchAllTracks()));
ipcMain.handle("studio:list-soundcloud-tracks", () => studioDatabase.listSoundCloudTracks());
ipcMain.handle("studio:update-soundcloud-track", (_event, input: UpdateSoundCloudTrackInput) => studioDatabase.updateSoundCloudTrack(input));
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
  const dimensions = kind === "cover" ? await getImageDimensions(filePath) : null;
  return studioDatabase.attachAsset({ releaseId, kind, filePath, fileName: path.basename(filePath), mimeType: inferMimeType(filePath), sizeBytes: details.size, modifiedAt: details.mtime.toISOString(), width: dimensions?.width ?? null, height: dimensions?.height ?? null });
});

async function getImageDimensions(filePath: string): Promise<{ width: number; height: number } | null> {
  const buffer = await readFile(filePath);
  if (buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset++; continue; }
      const marker = buffer[offset + 1];
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  return null;
}

function inferMimeType(filePath: string): string | null {
  const extension = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = { ".wav": "audio/wav", ".mp3": "audio/mpeg", ".flac": "audio/flac", ".aiff": "audio/aiff", ".aif": "audio/aiff", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".tif": "image/tiff", ".tiff": "image/tiff" };
  return types[extension] ?? null;
}

void app.whenReady().then(() => {
  studioDatabase = new StudioDatabase(path.join(app.getPath("userData"), "ai-studio-manager.sqlite"));
  studioDatabase.initialize();
  soundCloudClient = new SoundCloudClient(app.getPath("userData"));
  if (process.platform === "win32" && !app.isPackaged) app.setAsDefaultProtocolClient("ai-studio-manager", process.execPath, [path.resolve(process.argv[1])]);
  else app.setAsDefaultProtocolClient("ai-studio-manager");
  createWindow();
  const initialCallback = soundCloudCallbackFromArgs(process.argv);
  if (initialCallback) void handleSoundCloudCallback(initialCallback);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("open-url", (event, url) => {
  if (!url.startsWith("ai-studio-manager://soundcloud/callback")) return;
  event.preventDefault();
  if (soundCloudClient) void handleSoundCloudCallback(url);
});

app.on("second-instance", (_event, argv) => {
  const callback = soundCloudCallbackFromArgs(argv);
  if (callback && soundCloudClient) void handleSoundCloudCallback(callback);
});

app.on("before-quit", () => studioDatabase?.close());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
