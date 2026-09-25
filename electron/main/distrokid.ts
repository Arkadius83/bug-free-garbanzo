import { randomUUID } from "node:crypto";
import { access, readFileSync } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import { BrowserWindow } from "electron";
import type { ContentLanguage, DistroKidConnection, DistroKidFieldReport, DistroKidFillResult, DistroKidFileReport, DistroKidFormPayload, DistroKidUploadSession } from "../shared/contracts.js";
import type { StudioDatabase } from "./database/database.js";
import {
  DISTROKID_UPLOAD_URL,
  buildDistroKidFillScript,
  buildDistroKidFileVerifyScript,
  buildDistroKidFormPayload,
  composeDistroKidFillResult,
  mapUploadTargets,
  toFieldReports,
  type DistroKidPageReport,
} from "./distrokid-form.js";

const accessAsync = promisify(access);

interface YouTubeStoredChannel {
  channelId?: string;
  channel?: { channelId?: string };
}

export class DistroKidClient {
  private window: BrowserWindow | null = null;
  private session: DistroKidUploadSession | null = null;
  private payload: DistroKidFormPayload | null = null;
  private lastError: string | null = null;

  constructor(private readonly database: StudioDatabase, private readonly userDataPath: string) {}

  status(): DistroKidConnection {
    const open = Boolean(this.window && !this.window.isDestroyed());
    return {
      configured: true,
      connected: open,
      mode: "browser-assisted",
      uploadUrl: DISTROKID_UPLOAD_URL,
      sessionId: open ? this.session?.sessionId ?? null : null,
      releaseId: open ? this.session?.releaseId ?? null : null,
      openedAt: open ? this.session?.openedAt ?? null : null,
      error: this.lastError,
    };
  }

  prepareFormPayload(releaseId: string): DistroKidFormPayload {
    const release = this.database.listReleases().find((item) => item.id === releaseId);
    if (!release) throw new Error("Release not found");
    const spotify = this.database.getSpotifyArtistMappings().find((item) => item.artistId === release.artistId);
    const genres = this.database.getArtistGenres(release.artistId);
    const defaults = this.database.getDistroKidArtistDefaults(release.artistId);
    const aiSettings = this.database.getSetting<{ language?: ContentLanguage }>("ai.settings", {});
    const language: ContentLanguage = aiSettings.language === "de" || aiSettings.language === "pl" ? aiSettings.language : "en";
    this.payload = buildDistroKidFormPayload(release, this.database.listAssets(releaseId), {
      spotifyUrl: spotify ? `https://open.spotify.com/artist/${spotify.spotifyArtistId}` : null,
      youtubeUrl: this.youtubeMusicUrl(),
      language,
      secondaryGenre: genres[1] ?? null,
      recordLabel: defaults.recordLabel,
      songwriter: defaults.songwriter,
      appleUrl: defaults.appleArtistUrl,
      trackPrice: defaults.trackPrice,
      albumPrice: defaults.albumPrice,
      instrumental: defaults.instrumental,
    });
    this.lastError = null;
    return this.payload;
  }

  openUpload(releaseId: string): DistroKidUploadSession {
    const payload = this.prepareFormPayload(releaseId);
    let target: BrowserWindow;
    if (this.window && !this.window.isDestroyed()) {
      target = this.window;
      target.focus();
      if (!target.webContents.getURL().startsWith(DISTROKID_UPLOAD_URL)) void target.loadURL(DISTROKID_UPLOAD_URL);
    } else {
      target = this.createWindow();
      this.window = target;
      void target.loadURL(DISTROKID_UPLOAD_URL);
    }
    target.removeAllListeners("closed");
    target.on("closed", () => { if (this.window === target) { this.window = null; this.session = null; this.payload = null; } });
    this.session = { sessionId: randomUUID(), releaseId, openedAt: new Date().toISOString(), uploadUrl: DISTROKID_UPLOAD_URL, payload };
    this.lastError = null;
    return this.session;
  }

  async fillForm(): Promise<DistroKidFillResult> {
    if (!this.window || this.window.isDestroyed()) throw new Error("Open the DistroKid upload window first");
    if (!this.payload) throw new Error("Prepare a DistroKid form for a release first");
    const currentUrl = this.window.webContents.getURL();
    if (!currentUrl.startsWith("https://distrokid.com/")) throw new Error("Open the DistroKid upload form before filling");
    try {
      const raw = await this.window.webContents.executeJavaScript(buildDistroKidFillScript(this.payload), true);
      const page = isPageReport(raw) ? raw : null;
      let files: DistroKidFileReport[] = [];
      if (page && !page.loginRequired && page.formDetected) {
        files = await this.attachFiles();
      }
      const result = composeDistroKidFillResult(page, files);
      this.lastError = result.ok ? null : result.message;
      return result;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "DistroKid form fill failed";
      throw new Error(this.lastError);
    }
  }

  closeSession(): DistroKidConnection {
    if (this.window && !this.window.isDestroyed()) this.window.close();
    this.window = null;
    this.session = null;
    this.payload = null;
    this.lastError = null;
    return this.status();
  }

  private async attachFiles(): Promise<DistroKidFileReport[]> {
    if (!this.window || this.window.isDestroyed() || !this.payload) return [];
    const targets = mapUploadTargets(this.payload);
    const reports: DistroKidFileReport[] = [];
    const webContents = this.window.webContents;
    let attached = false;
    try {
      await webContents.debugger.attach("1.3");
      attached = true;
    } catch {
      attached = false;
    }
    for (const target of targets) {
      try {
        await accessAsync(target.filePath);
      } catch {
        reports.push({ kind: target.kind, track: target.track, fileName: target.fileName, selector: target.selector, status: "missing-on-disk" });
        continue;
      }
      if (!attached) {
        reports.push({ kind: target.kind, track: target.track, fileName: target.fileName, selector: target.selector, status: "error" });
        continue;
      }
      try {
        const document = await webContents.debugger.sendCommand("DOM.getDocument", { depth: -1 }) as { root?: { nodeId?: number } };
        const rootId = document.root?.nodeId;
        if (rootId == null) throw new Error("No DOM root");
        const query = await webContents.debugger.sendCommand("DOM.querySelector", { nodeId: rootId, selector: target.selector }) as { nodeId?: number };
        if (!query.nodeId) {
          reports.push({ kind: target.kind, track: target.track, fileName: target.fileName, selector: target.selector, status: "not-found" });
          continue;
        }
        await webContents.debugger.sendCommand("DOM.setFileInputFiles", { files: [target.filePath], nodeId: query.nodeId });
        reports.push({ kind: target.kind, track: target.track, fileName: target.fileName, selector: target.selector, status: "attached" });
      } catch (error) {
        reports.push({ kind: target.kind, track: target.track, fileName: target.fileName, selector: target.selector, status: "error" });
        void error;
      }
    }
    if (attached) {
      try { await webContents.debugger.detach(); } catch { /* already detached */ }
    }
    const verified = await this.verifyAttachedFiles(reports);
    return verified;
  }

  private async verifyAttachedFiles(reports: DistroKidFileReport[]): Promise<DistroKidFileReport[]> {
    if (!this.window || this.window.isDestroyed()) return reports;
    try {
      const raw = await this.window.webContents.executeJavaScript(buildDistroKidFileVerifyScript(), true);
      if (!Array.isArray(raw)) return reports;
      const byToken = new Map<string, string | null>();
      for (const entry of raw) {
        if (entry && typeof entry === "object" && typeof (entry as { token?: unknown }).token === "string") {
          byToken.set((entry as { token: string }).token, typeof (entry as { fileName?: unknown }).fileName === "string" ? (entry as { fileName: string }).fileName : null);
        }
      }
      return reports.map((report) => {
        if (report.status !== "attached" || !report.selector) return report;
        const match = /data-mam-dk="([^"]+)"/.exec(report.selector);
        const token = match?.[1];
        if (!token) return report;
        const fileName = byToken.get(token);
        if (fileName) return { ...report, status: "attached" as const, fileName };
        return { ...report, status: "error" as const };
      });
    } catch {
      return reports;
    }
  }

  private youtubeMusicUrl(): string | null {
    const candidates = [
      path.join(this.userDataPath, "integrations", "youtube-data.json"),
      path.join(this.userDataPath, "integrations", "youtube.json"),
    ];
    for (const file of candidates) {
      try {
        const parsed = JSON.parse(readFileSync(file, "utf8")) as YouTubeStoredChannel;
        const channelId = typeof parsed.channelId === "string" ? parsed.channelId : typeof parsed.channel?.channelId === "string" ? parsed.channel.channelId : null;
        if (channelId) return `https://music.youtube.com/channel/${channelId}`;
      } catch { /* try next */ }
    }
    return null;
  }

  private createWindow(): BrowserWindow {
    return new BrowserWindow({
      width: 1280,
      height: 920,
      title: "DistroKid Upload — AI Studio Manager",
      webPreferences: { partition: "persist:distrokid", contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
  }
}

function isPageReport(value: unknown): value is DistroKidPageReport {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DistroKidPageReport>;
  return typeof candidate.loginRequired === "boolean" && typeof candidate.formDetected === "boolean" && Array.isArray(candidate.fields);
}

export type { DistroKidFieldReport };
