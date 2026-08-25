import { app, BrowserWindow, dialog, ipcMain, net, protocol } from "electron";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { discoverOllamaModels, generateCampaignDraft, generateCampaignPackContent, runPlanningAgent } from "./ollama.js";
import type { AddContactInteractionInput, AiSettings, AssetKind, CreatePublishingQueueInput, CreateReleaseDraftInput, CreateTaskInput, DraftStatus, GenerateCampaignDraftInput, GenerateCampaignPackInput, GenerateMediaInput, PublishingStatus, SaveGeneratedDraftInput, SoundCloudContentType, SpotifyArtistMapping, SystemStatus, TaskStatus, UpdateBrandProfileInput, UpdateReleaseInput, UpdateSoundCloudTrackInput, UpsertContactInput } from "../shared/contracts.js";
import { StudioDatabase } from "./database/database.js";
import { analyzeAudioFile } from "./audio-analysis.js";
import { SoundCloudClient } from "./soundcloud.js";
import { SpotifyClient } from "./spotify.js";
import { MediaGenerationClient } from "./media-generation.js";
import { LocalServicesManager } from "./local-services.js";
import { MetaClient } from "./meta.js";
import { MediaBridgeClient } from "./media-bridge.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
protocol.registerSchemesAsPrivileged([{ scheme: "studio-media", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
let studioDatabase: StudioDatabase;
let soundCloudClient: SoundCloudClient;
let spotifyClient: SpotifyClient;
let mediaGenerationClient: MediaGenerationClient;
let localServicesManager: LocalServicesManager;
let metaClient: MetaClient;
let mediaBridgeClient: MediaBridgeClient;
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
ipcMain.handle("studio:get-asset-playback-url", (_event, assetId: string) => { const asset=studioDatabase.getAssetForAnalysis(assetId); if(!asset||asset.kind!=="audio")throw new Error("Audio asset not found"); return `studio-media://asset/${encodeURIComponent(assetId)}`; });
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
ipcMain.handle("studio:set-soundcloud-tracks-content-type", (_event, ids: number[], contentType: SoundCloudContentType) => studioDatabase.setSoundCloudTracksContentType(ids, contentType));
ipcMain.handle("studio:link-soundcloud-track", (_event, trackId: number, releaseId: string | null) => studioDatabase.linkSoundCloudTrack(trackId, releaseId));
ipcMain.handle("studio:get-soundcloud-track-performance", (_event, trackId: number) => studioDatabase.getSoundCloudTrackPerformance(trackId));
ipcMain.handle("studio:get-spotify-connection", () => spotifyClient.status());
ipcMain.handle("studio:save-spotify-client-id", (_event, clientId: string) => spotifyClient.saveClientId(clientId));
ipcMain.handle("studio:begin-spotify-connect", () => spotifyClient.beginConnect());
ipcMain.handle("studio:disconnect-spotify", () => spotifyClient.disconnect());
ipcMain.handle("studio:get-spotify-artist-mappings", () => studioDatabase.getSpotifyArtistMappings());
ipcMain.handle("studio:save-spotify-artist-mappings", (_event, mappings: SpotifyArtistMapping[]) => studioDatabase.saveSpotifyArtistMappings(mappings));
ipcMain.handle("studio:list-spotify-releases", () => studioDatabase.listSpotifyReleases());
ipcMain.handle("studio:sync-spotify-catalog", async () => { for (const mapping of studioDatabase.getSpotifyArtistMappings()) studioDatabase.importSpotifyReleases(mapping.artistId, mapping.spotifyArtistId, await spotifyClient.fetchArtistReleases(mapping.spotifyArtistId)); return studioDatabase.listSpotifyReleases(); });
ipcMain.handle("studio:link-spotify-release", (_event, spotifyReleaseId: string, releaseId: string | null) => studioDatabase.linkSpotifyRelease(spotifyReleaseId, releaseId));
ipcMain.handle("studio:get-catalog-match-suggestions", () => studioDatabase.getCatalogMatchSuggestions());
ipcMain.handle("studio:generate-campaign-pack", async (_event, input:GenerateCampaignPackInput) => studioDatabase.saveCampaignPackItems(input.releaseId, input.language, input.model, await generateCampaignPackContent(input)));
ipcMain.handle("studio:list-campaign-pack-items", (_event, releaseId:string) => studioDatabase.listCampaignPackItems(releaseId));
ipcMain.handle("studio:update-campaign-pack-item-status", (_event,itemId:string,status:DraftStatus)=>studioDatabase.updateCampaignPackItemStatus(itemId,status));
ipcMain.handle("studio:get-media-generation-settings",()=>mediaGenerationClient.status());
ipcMain.handle("studio:save-media-generation-credentials",(_event,openAiKey:string,klingKey:string)=>mediaGenerationClient.saveCredentials(openAiKey,klingKey));
ipcMain.handle("studio:test-comfy-ui",(_event,url:string)=>mediaGenerationClient.testComfyUi(url));
ipcMain.handle("studio:save-comfy-ui-settings",(_event,url:string,checkpoint:string)=>mediaGenerationClient.saveComfyUiSettings(url,checkpoint));
ipcMain.handle("studio:get-local-service-status",()=>localServicesManager.status());
ipcMain.handle("studio:set-local-services-auto-start",(_event,enabled:boolean)=>localServicesManager.setAutoStart(Boolean(enabled)));
ipcMain.handle("studio:start-local-service",(_event,service:"ollama"|"comfyui")=>localServicesManager.start(service));
ipcMain.handle("studio:stop-local-service",(_event,service:"ollama"|"comfyui")=>localServicesManager.stop(service));
ipcMain.handle("studio:select-comfy-ui-launcher",async(event)=>{const owner=BrowserWindow.fromWebContents(event.sender)??undefined;const options={properties:["openFile"] as ("openFile")[],filters:[{name:"Windows batch files",extensions:["bat"]}]};const result=owner?await dialog.showOpenDialog(owner,options):await dialog.showOpenDialog(options);if(result.canceled||!result.filePaths[0])return localServicesManager.status();return localServicesManager.setComfyLauncher(result.filePaths[0]);});
ipcMain.handle("studio:list-media-generations",(_event,releaseId:string)=>studioDatabase.listMediaGenerations(releaseId));
ipcMain.handle("studio:get-generated-media-url",(_event,id:string)=>{if(!studioDatabase.getMediaGenerationFile(id))throw new Error("Generated media is not ready");return `studio-media://generation/${encodeURIComponent(id)}`;});
ipcMain.handle("studio:update-media-generation-status",(_event,id:string,status:"approved"|"rejected")=>{const current=studioDatabase.getMediaGeneration(id);if(!current||!(["ready","approved","rejected"] as string[]).includes(current.status))throw new Error("Only completed media can be reviewed");return studioDatabase.updateMediaGeneration(id,{status});});
ipcMain.handle("studio:list-publishing-queue",()=>studioDatabase.listPublishingQueue());
ipcMain.handle("studio:create-publishing-queue-item",(_event,input:CreatePublishingQueueInput)=>studioDatabase.createPublishingQueueItem(input));
ipcMain.handle("studio:update-publishing-queue-status",(_event,id:string,status:PublishingStatus)=>studioDatabase.updatePublishingQueueStatus(id,status));
ipcMain.handle("studio:export-publishing-pack",async(event,id:string)=>{const data=studioDatabase.getPublishingExportData(id);if(!["approved","scheduled","published"].includes(data.item.status))throw new Error("Approve the post before exporting its publishing pack");if(data.item.rightsBlocked&&["SoundCloud","YouTube"].includes(data.item.platform))throw new Error("Bootleg rights are not cleared: official publishing export is blocked");const owner=BrowserWindow.fromWebContents(event.sender)??undefined;const result=owner?await dialog.showOpenDialog(owner,{properties:["openDirectory","createDirectory"]}):await dialog.showOpenDialog({properties:["openDirectory","createDirectory"]});if(result.canceled||!result.filePaths[0])return null;const safeName=`${data.item.releaseTitle}-${data.item.platform}`.replace(/[^a-z0-9_-]+/gi,"-").replace(/^-|-$/g,"").slice(0,80)||"publishing-pack";const directory=path.join(result.filePaths[0],`${safeName}-${data.item.id.slice(0,8)}`);await mkdir(directory,{recursive:true});await writeFile(path.join(directory,"caption.txt"),data.item.caption,"utf8");await writeFile(path.join(directory,"publishing.json"),JSON.stringify({release:data.item.releaseTitle,platform:data.item.platform,scheduledAt:data.item.scheduledAt,status:data.item.status,rightsBlocked:data.item.rightsBlocked,exportedAt:new Date().toISOString()},null,2),"utf8");if(data.mediaPath){const extension=path.extname(data.mediaPath)|| (data.item.mediaType==="video"?".mp4":".png");await copyFile(data.mediaPath,path.join(directory,`media${extension}`));}studioDatabase.markPublishingPackExported(id);return directory;});
ipcMain.handle("studio:list-brand-profiles",()=>studioDatabase.listBrandProfiles());
ipcMain.handle("studio:update-brand-profile",(_event,input:UpdateBrandProfileInput)=>studioDatabase.updateBrandProfile(input));
ipcMain.handle("studio:list-contacts",()=>studioDatabase.listContacts());
ipcMain.handle("studio:save-contact",(_event,input:UpsertContactInput)=>studioDatabase.saveContact(input));
ipcMain.handle("studio:delete-contact",(_event,id:string)=>studioDatabase.deleteContact(id));
ipcMain.handle("studio:add-contact-interaction",(_event,input:AddContactInteractionInput)=>studioDatabase.addContactInteraction(input));
ipcMain.handle("studio:get-meta-connection",()=>metaClient.status());
ipcMain.handle("studio:save-meta-credentials",(_event,appId:string,appSecret:string)=>metaClient.saveCredentials(appId,appSecret));
ipcMain.handle("studio:begin-meta-connect",()=>metaClient.beginConnect());
ipcMain.handle("studio:disconnect-meta",()=>metaClient.disconnect());
ipcMain.handle("studio:get-media-bridge-status",()=>mediaBridgeClient.status());
ipcMain.handle("studio:save-media-bridge-settings",(_event,accountId:string,bucket:string,accessKeyId:string,secretAccessKey:string)=>mediaBridgeClient.saveSettings(accountId,bucket,accessKeyId,secretAccessKey));
ipcMain.handle("studio:publish-meta-queue-item",async(_event,id:string,destinationId:string)=>{const data=studioDatabase.getPublishingExportData(id);if(!["approved","scheduled","failed"].includes(data.item.status))throw new Error("Approve or schedule the post before publishing");if(!["Facebook","Instagram"].includes(data.item.platform))throw new Error("This queue item is not a Meta post");const destination=(await metaClient.status()).destinations.find((item)=>item.id===destinationId);if(!destination||destination.platform!==data.item.platform)throw new Error(`Select a connected ${data.item.platform} destination`);try{if(data.item.platform==="Instagram"){if(!data.mediaPath||data.item.mediaType!=="image")throw new Error("Instagram Feed publishing requires an approved PNG or JPEG image");const staged=await mediaBridgeClient.stage(data.mediaPath,data.mimeType);try{const remoteId=await metaClient.publishInstagram(destinationId,data.item.caption,staged.url);return studioDatabase.markPublishingSucceeded(id,destinationId,remoteId);}finally{await mediaBridgeClient.remove(staged.key).catch((error)=>console.warn("Could not remove temporary R2 object",error));}}if(data.item.mediaType==="video")throw new Error("Facebook video upload is not included in Meta Publishing V1; export the pack manually");const remoteId=await metaClient.publishFacebook(destinationId,data.item.caption,data.mediaPath,data.mimeType);return studioDatabase.markPublishingSucceeded(id,destinationId,remoteId);}catch(error){const message=error instanceof Error?error.message:"Meta publishing failed";studioDatabase.markPublishingFailed(id,message);throw error;}});
ipcMain.handle("studio:generate-media",async(_event,input:GenerateMediaInput)=>{const item=studioDatabase.getCampaignPackItemForGeneration(input.campaignPackItemId);if(!item)throw new Error("Campaign prompt not found");if(item.status!=="approved")throw new Error("Approve the prompt before starting generation");if(input.mediaType==="image"&&item.kind!=="image-prompt")throw new Error("Select an approved image prompt");if(input.mediaType==="video"&&item.kind!=="visualizer-prompt"&&item.kind!=="video-script")throw new Error("Select an approved visualizer or video script");const brand=studioDatabase.getBrandProfileForRelease(item.releaseId);if(!brand)throw new Error("Brand profile not found");const aspectRatio=input.aspectRatio??brand.defaultAspectRatio;const enhancedPrompt=`${item.content}\n\nBRAND DIRECTION: ${brand.visualDirection}. PALETTE: ${brand.palette}. COMPOSITION: ${brand.requiredElements}. LAYOUT/TYPOGRAPHY SPACE: ${brand.typography}. FORBIDDEN: ${brand.forbiddenElements}. Output aspect ratio ${aspectRatio}. No rendered text unless explicitly requested.`;let row=studioDatabase.createMediaGeneration(item,input.provider,input.mediaType);row=studioDatabase.updateMediaGeneration(row.id,{status:"generating",metadata:{aspectRatio,brandArtistId:brand.artistId,enhancedPrompt}});try{if(input.provider==="comfyui"){const service=await localServicesManager.start("comfyui");if(!service.comfyUi.running)throw new Error(service.comfyUi.error??"ComfyUI did not become ready within 60 seconds");}const result=await mediaGenerationClient.generate(input.provider,input.mediaType,enhancedPrompt,{aspectRatio,negativePrompt:brand.negativePrompt});if(result.bytes||result.remoteUrl){const saved=await mediaGenerationClient.saveRemoteResult(row.id,result,input.mediaType);return studioDatabase.updateMediaGeneration(row.id,{status:"ready",providerTaskId:result.providerTaskId,localPath:saved.localPath,mimeType:saved.mimeType,metadata:{...row.metadata,...saved.metadata}});}return studioDatabase.updateMediaGeneration(row.id,{status:"generating",providerTaskId:result.providerTaskId,metadata:{...row.metadata,...result.metadata}});}catch(error){studioDatabase.updateMediaGeneration(row.id,{status:"failed",error:error instanceof Error?error.message:"Generation failed",metadata:row.metadata});throw error;}});
ipcMain.handle("studio:refresh-media-generation",async(_event,id:string)=>{const row=studioDatabase.getMediaGeneration(id);if(!row)throw new Error("Media generation not found");if(!row.providerTaskId||!["kling","comfyui"].includes(row.provider))return row;try{const result=row.provider==="comfyui"?await mediaGenerationClient.refreshComfyUi(row.providerTaskId):await mediaGenerationClient.refreshKling(row.providerTaskId,row.mediaType);if(!result)return row;const saved=await mediaGenerationClient.saveRemoteResult(row.id,result,row.mediaType);return studioDatabase.updateMediaGeneration(row.id,{status:"ready",localPath:saved.localPath,mimeType:saved.mimeType,metadata:{...row.metadata,...saved.metadata}});}catch(error){return studioDatabase.updateMediaGeneration(row.id,{status:"failed",error:error instanceof Error?error.message:`${row.provider} generation failed`,metadata:row.metadata});}});
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

void app.whenReady().then(async () => {
  studioDatabase = new StudioDatabase(path.join(app.getPath("userData"), "ai-studio-manager.sqlite"));
  studioDatabase.initialize();
  soundCloudClient = new SoundCloudClient(app.getPath("userData"));
  spotifyClient = new SpotifyClient(app.getPath("userData"));
  mediaGenerationClient = new MediaGenerationClient(app.getPath("userData"));
  localServicesManager = new LocalServicesManager(app.getPath("userData"));
  metaClient = new MetaClient(app.getPath("userData"));
  mediaBridgeClient = new MediaBridgeClient(app.getPath("userData"));
  await localServicesManager.startConfigured();
  protocol.handle("studio-media", (request) => { const url=new URL(request.url),id=decodeURIComponent(url.pathname.slice(1));if(url.hostname==="asset"){const asset=studioDatabase.getAssetForAnalysis(id);if(!asset||asset.kind!=="audio")return new Response("Not found",{status:404});return net.fetch(pathToFileURL(asset.filePath).toString(),{headers:request.headers});}if(url.hostname==="generation"){const media=studioDatabase.getMediaGenerationFile(id);if(!media)return new Response("Not found",{status:404});return net.fetch(pathToFileURL(media.filePath).toString(),{headers:request.headers});}return new Response("Not found",{status:404});});
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

app.on("before-quit", () => { localServicesManager?.stopManaged(); studioDatabase?.close(); });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
