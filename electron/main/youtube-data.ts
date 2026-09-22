import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import * as electron from "electron";
import type { YouTubeChannelDataSnapshot, YouTubeChannelDataSyncResult, YouTubeChannelSnapshot, YouTubeVideoSnapshot } from "../shared/contracts.js";
import { sanitizeYouTubeError } from "./youtube-oauth.js";

export const sanitizeYouTubeDataError = sanitizeYouTubeError;

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const CACHE_SCHEMA_VERSION = 1;

interface StoredYouTube {
  clientId: string;
  clientSecretEncrypted: string;
  accessTokenEncrypted?: string;
  refreshTokenEncrypted?: string;
  expiresAt?: string;
  channelId?: string;
  channelTitle?: string;
  scope?: string;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "string" && value !== "" && !isNaN(Number(value))) return Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function parseBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function parseThumbnails(raw: unknown): Record<string, { url: string; width?: number | null; height?: number | null }> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, { url: string; width?: number | null; height?: number | null }> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (val && typeof val === "object" && typeof (val as Record<string, unknown>).url === "string") {
      const v = val as Record<string, unknown>;
      out[key] = { url: String(v.url), width: parseNumber(v.width), height: parseNumber(v.height) };
    }
  }
  return Object.keys(out).length ? out : null;
}

export function parseYouTubeChannel(raw: unknown): YouTubeChannelSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : null;
  if (!id) return null;
  const snippet = (r.snippet as Record<string, unknown>) ?? {};
  const contentDetails = (r.contentDetails as Record<string, unknown>) ?? {};
  const statistics = (r.statistics as Record<string, unknown>) ?? {};
  const brandingSettings = (r.brandingSettings as Record<string, unknown>) ?? null;
  const relatedPlaylists = (contentDetails.relatedPlaylists as Record<string, unknown>) ?? {};
  return {
    channelId: id,
    title: typeof snippet.title === "string" ? snippet.title : "",
    description: typeof snippet.description === "string" ? snippet.description : null,
    customUrl: typeof snippet.customUrl === "string" ? snippet.customUrl : null,
    publishedAt: typeof snippet.publishedAt === "string" ? snippet.publishedAt : null,
    country: typeof snippet.country === "string" ? snippet.country : null,
    thumbnails: parseThumbnails(snippet.thumbnails),
    subscriberCount: parseNumber(statistics.subscriberCount),
    hiddenSubscriberCount: parseBool(statistics.hiddenSubscriberCount),
    viewCount: parseNumber(statistics.viewCount),
    videoCount: parseNumber(statistics.videoCount),
    uploadsPlaylistId: typeof relatedPlaylists.uploads === "string" ? String(relatedPlaylists.uploads) : null,
    brandingSettings: brandingSettings ? (brandingSettings as Record<string, unknown>) : null
  };
}

export function extractUploadsPlaylistId(channel: unknown): string | null {
  const parsed = parseYouTubeChannel(channel);
  return parsed?.uploadsPlaylistId ?? null;
}

export function dedupeVideoIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || !id) continue;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function batchVideoIds(ids: string[], batchSize = 50): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += batchSize) batches.push(ids.slice(i, i + batchSize));
  return batches;
}
export function collectPlaylistVideoIds(pages: unknown[]): string[] {
  const ids: string[] = [];
  for (const page of pages) {
    const items = page && typeof page === "object" && Array.isArray((page as { items?: unknown[] }).items) ? (page as { items: unknown[] }).items : [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const record = item as { snippet?: { resourceId?: { videoId?: unknown } }; contentDetails?: { videoId?: unknown } };
      const videoId = record.snippet?.resourceId?.videoId ?? record.contentDetails?.videoId;
      if (typeof videoId === "string" && videoId) ids.push(videoId);
    }
  }
  return ids;
}

export function snapshotMatchesChannel(snapshot: YouTubeChannelDataSnapshot | null, channelId: string | null | undefined): boolean {
  return Boolean(snapshot && channelId && snapshot.channelId === channelId);
}

export function retainSnapshotAfterFailedSync(snapshot: YouTubeChannelDataSnapshot, attemptedAt: string): YouTubeChannelDataSnapshot {
  return { ...snapshot, lastAttemptAt: attemptedAt };
}

export function parseYouTubeVideo(raw: unknown): YouTubeVideoSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const videoId = typeof r.id === "string" ? r.id : null;
  if (!videoId) return null;
  const snippet = (r.snippet as Record<string, unknown>) ?? {};
  const contentDetails = (r.contentDetails as Record<string, unknown>) ?? {};
  const statistics = (r.statistics as Record<string, unknown>) ?? {};
  const status = (r.status as Record<string, unknown>) ?? {};
  return {
    videoId,
    channelId: typeof snippet.channelId === "string" ? snippet.channelId : "",
    title: typeof snippet.title === "string" ? snippet.title : "",
    description: typeof snippet.description === "string" ? snippet.description : null,
    publishedAt: typeof snippet.publishedAt === "string" ? snippet.publishedAt : null,
    tags: Array.isArray(snippet.tags) ? (snippet.tags.filter((t): t is string => typeof t === "string") as string[]) : null,
    categoryId: typeof snippet.categoryId === "string" ? snippet.categoryId : null,
    thumbnails: parseThumbnails(snippet.thumbnails),
    duration: typeof contentDetails.duration === "string" ? String(contentDetails.duration) : null,
    definition: typeof contentDetails.definition === "string" ? String(contentDetails.definition) : null,
    caption: typeof contentDetails.caption === "string" ? String(contentDetails.caption) : null,
    licensedContent: parseBool(contentDetails.licensedContent),
    privacyStatus: typeof status.privacyStatus === "string" ? String(status.privacyStatus) : null,
    uploadStatus: typeof status.uploadStatus === "string" ? String(status.uploadStatus) : null,
    embeddable: parseBool(status.embeddable),
    madeForKids: parseBool(status.madeForKids),
    viewCount: parseNumber(statistics.viewCount),
    likeCount: parseNumber(statistics.likeCount),
    commentCount: parseNumber(statistics.commentCount)
  };
}

export class YouTubeDataService {
  private readonly cachePath: string;
  private readonly authPath: string;

  constructor(userDataPath: string) {
    this.cachePath = path.join(userDataPath, "integrations", "youtube-data.json");
    this.authPath = path.join(userDataPath, "integrations", "youtube.json");
  }

  async getChannelData(): Promise<YouTubeChannelDataSnapshot | null> {
    const cached = await this.readCache();
    if (!cached) return null;
    // multi-channel safety: verify cached channelId matches currently connected channelId
    const auth = await this.readAuth();
    if (auth?.channelId && !snapshotMatchesChannel(cached, auth.channelId)) {
      return null;
    }
    // also if auth not connected, keep returning cached? spec says never show stale from old channel, but if currently connected same channel, show cached. If disconnected, maybe still show last sync? For safety, if not connected, return cached but UI will handle. We enforce channelId binding only.
    return cached;
  }

  async syncChannelData(): Promise<YouTubeChannelDataSyncResult> {
    const startedAt = new Date().toISOString();
    let channel: YouTubeChannelSnapshot | null = null;
    let videos: YouTubeVideoSnapshot[] = [];
    let pagesFetched = 0;
    let videosFetched = 0;
    try {
      const token = await this.getAuthorizedToken();
      channel = await this.fetchChannel(token);
      if (!channel) throw new Error("YouTube channel not found");
      if (!channel.uploadsPlaylistId) {
        // channel without uploads is valid, return empty videos
        videos = [];
      } else {
        const { videoIds, pages } = await this.fetchAllVideoIds(token, channel.uploadsPlaylistId);
        pagesFetched = pages;
        const deduped = dedupeVideoIds(videoIds);
        const batches = batchVideoIds(deduped, 50);
        const allVideos: YouTubeVideoSnapshot[] = [];
        for (const batch of batches) {
          const batchVideos = await this.fetchVideos(token, batch);
          allVideos.push(...batchVideos);
        }
        videos = allVideos;
        videosFetched = videos.length;
      }
      const syncedAt = new Date().toISOString();
      const snapshot: YouTubeChannelDataSnapshot = {
        schemaVersion: CACHE_SCHEMA_VERSION,
        channelId: channel.channelId,
        lastSuccessfulSyncAt: syncedAt,
        lastAttemptAt: syncedAt,
        channel,
        videos
      };
      await this.writeCacheAtomic(snapshot);
      return { channel, videos, syncedAt, videosFetched, pagesFetched, ok: true, sanitizedError: null };
    } catch (error) {
      const sanitized = sanitizeYouTubeError(error instanceof Error ? error.message : "YouTube sync failed");
      // sanitize Google API errors: keep endpoint path, http status, channelId, counts
      // do not expose tokens
      const sanitizedError = sanitized.slice(0, 800);
      const now = new Date().toISOString();
      // retain prior successful snapshot on failure: update lastAttemptAt only if cache exists
      const existing = await this.readCache();
      if (existing) {
        // update lastAttemptAt but keep lastSuccessfulSyncAt
        const updated = retainSnapshotAfterFailedSync(existing, now);
        // if channel changed, don't update stale channel's cache with failure attempt? keep as is
        try { await this.writeCacheAtomic(updated); } catch {}
      }
      return { channel, videos, syncedAt: now, videosFetched, pagesFetched, ok: false, sanitizedError: sanitizedError };
    }
  }

  private async fetchChannel(token: string): Promise<YouTubeChannelSnapshot | null> {
    const url = `${YOUTUBE_API}/channels?mine=true&part=snippet,contentDetails,statistics,brandingSettings`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      const text = (await response.text()).slice(0, 500);
      throw new Error(`GET ${new URL(url).pathname} failed HTTP ${response.status}: ${text}`);
    }
    const json = (await response.json()) as { items?: unknown[] };
    if (!json.items?.[0]) throw new Error("YouTube channel not found");
    return parseYouTubeChannel(json.items?.[0]);
  }

  private async fetchAllVideoIds(token: string, uploadsPlaylistId: string): Promise<{ videoIds: string[]; pages: number }> {
    const videoIds: string[] = [];
    let pageToken: string | undefined = undefined;
    let pages = 0;
    do {
      const params = new URLSearchParams({ playlistId: uploadsPlaylistId, part: "snippet,contentDetails", maxResults: "50" });
      if (pageToken) params.set("pageToken", pageToken);
      const url = `${YOUTUBE_API}/playlistItems?${params.toString()}`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) {
        const text = (await response.text()).slice(0, 500);
        throw new Error(`GET ${new URL(url).pathname} failed HTTP ${response.status}: ${text}`);
      }
      const json = (await response.json()) as { items?: Array<{ snippet?: { resourceId?: { videoId?: string } }; contentDetails?: { videoId?: string } }>; nextPageToken?: string };
      videoIds.push(...collectPlaylistVideoIds([json]));

      pageToken = json.nextPageToken;
      pages += 1;
      if (pages > 100) break; // safety
    } while (pageToken);
    return { videoIds, pages };
  }

  private async fetchVideos(token: string, ids: string[]): Promise<YouTubeVideoSnapshot[]> {
    if (ids.length === 0) return [];
    const params = new URLSearchParams({ id: ids.join(","), part: "snippet,contentDetails,statistics,status", maxResults: "50" });
    const url = `${YOUTUBE_API}/videos?${params.toString()}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      const text = (await response.text()).slice(0, 500);
      throw new Error(`GET ${new URL(url).pathname} failed HTTP ${response.status}: ${text}`);
    }
    const json = (await response.json()) as { items?: unknown[] };
    const out: YouTubeVideoSnapshot[] = [];
    for (const raw of json.items ?? []) {
      const parsed = parseYouTubeVideo(raw);
      if (parsed) out.push(parsed);
    }
    return out;
  }

  private async getAuthorizedToken(): Promise<string> {
    const stored = await this.readAuth();
    if (!stored?.clientId || !stored.clientSecretEncrypted) throw new Error("Save YouTube Client ID and Client Secret first");
    if (!stored.accessTokenEncrypted || !stored.refreshTokenEncrypted) throw new Error("Connect YouTube first");
    if (stored.expiresAt && Date.parse(stored.expiresAt) > Date.now() + 60_000) return this.decrypt(stored.accessTokenEncrypted);
    const secret = this.decrypt(stored.clientSecretEncrypted);
    const refresh = this.decrypt(stored.refreshTokenEncrypted);
    const tokens = await this.exchangeToken({ client_id: stored.clientId, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" });
    const updated: StoredYouTube = {
      ...stored,
      accessTokenEncrypted: this.encrypt(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token ? this.encrypt(tokens.refresh_token) : stored.refreshTokenEncrypted,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    };
    await this.writeAuth(updated);
    return tokens.access_token;
  }

  private async exchangeToken(params: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }> {
    const TOKEN_URL = "https://oauth2.googleapis.com/token";
    const response = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params), signal: AbortSignal.timeout(30_000) });
    const text = await response.text();
    if (!response.ok) throw new Error(`YouTube token exchange failed HTTP ${response.status}: ${sanitizeYouTubeError(text.slice(0, 500))}`);
    return JSON.parse(text) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
  }

  private async readAuth(): Promise<StoredYouTube | null> {
    try { return JSON.parse(await readFile(this.authPath, "utf8")) as StoredYouTube; } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
  }
  private async writeAuth(value: StoredYouTube): Promise<void> {
    await mkdir(path.dirname(this.authPath), { recursive: true });
    await writeFile(this.authPath, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
  }
  private async readCache(): Promise<YouTubeChannelDataSnapshot | null> {
    try { return JSON.parse(await readFile(this.cachePath, "utf8")) as YouTubeChannelDataSnapshot; } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
  }
  private async writeCacheAtomic(value: YouTubeChannelDataSnapshot): Promise<void> {
    await mkdir(path.dirname(this.cachePath), { recursive: true });
    const tmp = `${this.cachePath}.tmp`;
    await writeFile(tmp, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(tmp, this.cachePath);
  }

  private encrypt(value: string): string {
    if (!electron.safeStorage.isEncryptionAvailable()) throw new Error("Operating-system credential encryption is unavailable");
    return electron.safeStorage.encryptString(value).toString("base64");
  }
  private decrypt(value: string): string {
    return electron.safeStorage.decryptString(Buffer.from(value, "base64"));
  }
}
