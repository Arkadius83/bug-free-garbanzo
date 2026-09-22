import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { YouTubeAnalyticsMetricSource, YouTubeAnalyticsRange, YouTubeAnalyticsSnapshot, YouTubeAnalyticsSyncResult, YouTubeChannelDataSnapshot } from "../shared/contracts.js";
import { sanitizeYouTubeError } from "./youtube-oauth.js";
const API = "https://youtubeanalytics.googleapis.com/v2/reports";
const DAYS: Record<YouTubeAnalyticsRange, number> = { "7d": 7, "28d": 28, "90d": 90 };
const num = (x: unknown) => typeof x === "number" ? x : typeof x === "string" && x !== "" && Number.isFinite(Number(x)) ? Number(x) : null;

export function analyticsRows<T>(raw: unknown, map: (row: Record<string, unknown>) => T): T[] {
  const d = raw as { columnHeaders?: Array<{ name?: string }>; rows?: unknown[][] };
  const headers = d.columnHeaders?.map(h => h.name ?? "") ?? [];
  return (d.rows ?? []).map(row => map(Object.fromEntries(headers.map((h, i) => [h, row[i]]))));
}
export function rangeDates(range: YouTubeAnalyticsRange, now = new Date()) {
  const e = new Date(now); e.setUTCDate(e.getUTCDate() - 1);
  const s = new Date(e); s.setUTCDate(s.getUTCDate() - (DAYS[range] - 1));
  return { startDate: s.toISOString().slice(0, 10), endDate: e.toISOString().slice(0, 10) };
}

export function buildDailyQuery(range: YouTubeAnalyticsRange) {
  return { dimensions: "day", metrics: "views,estimatedMinutesWatched,averageViewDuration,likes,comments", sort: undefined as string|undefined, maxResults: undefined as number|undefined, ...rangeDates(range) };
}
export function buildTopVideosQuery(range: YouTubeAnalyticsRange) {
  return { dimensions: "video", metrics: "views,estimatedMinutesWatched,averageViewDuration,likes,comments", sort: "-views" as string, maxResults: 200, ...rangeDates(range) };
}
export function buildTrafficSourcesQuery(range: YouTubeAnalyticsRange) {
  return { dimensions: "insightTrafficSourceType", metrics: "views,estimatedMinutesWatched", sort: "-views" as string, maxResults: undefined as number|undefined, ...rangeDates(range) };
}
export function buildDeviceTypesQuery(range: YouTubeAnalyticsRange) {
  return { dimensions: "deviceType", metrics: "views,estimatedMinutesWatched", sort: undefined as string|undefined, maxResults: undefined as number|undefined, ...rangeDates(range) };
}
export function buildCountriesQuery(range: YouTubeAnalyticsRange) {
  return { dimensions: "country", metrics: "views", sort: "-views" as string, maxResults: undefined as number|undefined, ...rangeDates(range) };
}
export function sanitizedQueryShape(q: { dimensions: string; metrics: string; sort?: string; maxResults?: number; startDate: string; endDate: string }) {
  return { dimensions: q.dimensions, metrics: q.metrics, sort: q.sort ?? null, maxResults: q.maxResults ?? null, startDate: q.startDate, endDate: q.endDate };
}

export class YouTubeAnalyticsService {
  private file: string;
  constructor(userData: string, private token: () => Promise<string>, private data: () => Promise<YouTubeChannelDataSnapshot | null>) {
    this.file = path.join(userData, "integrations", "youtube-analytics.json");
  }
  async getAnalytics(range: YouTubeAnalyticsRange) {
    const all = await this.read(), snapshot = all?.[range] ?? null, channel = await this.data();
    return snapshot && channel?.channelId === snapshot.channelId ? snapshot : null;
  }
  async syncAnalytics(range: YouTubeAnalyticsRange): Promise<YouTubeAnalyticsSyncResult> {
    const all = await this.read();
    const old = all?.[range] ?? null;
    try {
      const channel = await this.data();
      if (!channel) throw Error("Sync YouTube channel data before Analytics.");
      const token = await this.token();
      const videoLookup = new Map(channel.videos.map(v => [v.videoId, v]));
      const mapVideoRow = (r: Record<string, unknown>) => {
        const vid = String(r.video ?? "");
        const v = videoLookup.get(vid);
        return { videoId: vid, title: v?.title ?? null, thumbnailUrl: (v?.thumbnails as any)?.medium?.url ?? (v?.thumbnails as any)?.default?.url ?? null, views: num(r.views), estimatedMinutesWatched: num(r.estimatedMinutesWatched), averageViewDuration: num(r.averageViewDuration), likes: num(r.likes), likesSource: num(r.likes) != null ? ("analytics-period" as const) : null, comments: num(r.comments), commentsSource: num(r.comments) != null ? ("analytics-period" as const) : null };
      };

      const queries = [
        { key: "timeSeries" as const, builder: buildDailyQuery(range), mapper: (raw: unknown) => analyticsRows(raw, r => ({ day: String(r.day ?? ""), views: num(r.views), estimatedMinutesWatched: num(r.estimatedMinutesWatched), averageViewDuration: num(r.averageViewDuration), likes: num(r.likes), comments: num(r.comments) })) },
        { key: "videos" as const, builder: buildTopVideosQuery(range), mapper: (raw: unknown) => analyticsRows(raw, mapVideoRow) },
        { key: "trafficSources" as const, builder: buildTrafficSourcesQuery(range), mapper: (raw: unknown) => analyticsRows(raw, r => ({ source: String(r.insightTrafficSourceType ?? ""), views: num(r.views), estimatedMinutesWatched: num(r.estimatedMinutesWatched) })) },
        { key: "countries" as const, builder: buildCountriesQuery(range), mapper: (raw: unknown) => analyticsRows(raw, r => ({ country: String(r.country ?? ""), views: num(r.views), estimatedMinutesWatched: num(r.estimatedMinutesWatched) })) },
        { key: "devices" as const, builder: buildDeviceTypesQuery(range), mapper: (raw: unknown) => analyticsRows(raw, r => ({ device: String(r.deviceType ?? ""), views: num(r.views), estimatedMinutesWatched: num(r.estimatedMinutesWatched) })) },
      ];

      const results: Record<string, unknown> = {};
      const perDatasetErrors: Record<string, string> = {};
      let anySuccess = false;

      const settled = await Promise.allSettled(queries.map(async q => {
        const shape = sanitizedQueryShape(q.builder);
        console.info("[youtube-analytics] query shape", shape);
        const p = new URLSearchParams({ ids: "channel==MINE", dimensions: q.builder.dimensions, metrics: q.builder.metrics, startDate: q.builder.startDate, endDate: q.builder.endDate });
        if (q.builder.sort) p.set("sort", q.builder.sort);
        if (q.builder.maxResults) p.set("maxResults", String(q.builder.maxResults));
        const r = await fetch(`${API}?${p}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
        const text = await r.text();
        if (!r.ok) {
          const sanitized = sanitizeYouTubeError(`GET ${new URL(API).pathname} ${q.builder.dimensions}/${q.builder.metrics} failed HTTP ${r.status}: ${text.slice(0, 300)}`);
          console.warn("[youtube-analytics] query failed", { ...shape, status: r.status, error: sanitized });
          throw Error(sanitized);
        }
        const json = JSON.parse(text);
        console.info("[youtube-analytics] query ok", { ...shape, rows: (json.rows?.length ?? 0) });
        return { key: q.key, data: q.mapper(json) };
      }));

      for (let i = 0; i < settled.length; i++) {
        const s = settled[i];
        const key = queries[i].key;
        if (s.status === "fulfilled") {
          results[key] = s.value.data;
          anySuccess = true;
        } else {
          const errMsg = sanitizeYouTubeError(s.reason instanceof Error ? s.reason.message : String(s.reason));
          perDatasetErrors[key] = errMsg;
          console.warn("[youtube-analytics] dataset unavailable", { dataset: key, ...sanitizedQueryShape(queries[i].builder), error: errMsg });
          if (old && (old as any)[key]) {
            results[key] = (old as any)[key];
          } else {
            results[key] = [];
          }
        }
      }

      // Data API lifetime fallback: add videos not returned by Analytics
      const analyticsVideoIds = new Set((results["videos"] as any[]).map((v: any) => v.videoId));
      const analyticsVideos = (results["videos"] as any[]) ?? [];
      for (const v of channel.videos) {
        if (!analyticsVideoIds.has(v.videoId)) {
          analyticsVideos.push({
            videoId: v.videoId,
            title: v.title,
            thumbnailUrl: (v?.thumbnails as any)?.medium?.url ?? (v?.thumbnails as any)?.default?.url ?? null,
            views: v.viewCount,
            estimatedMinutesWatched: null,
            averageViewDuration: null,
            likes: num(v.likeCount),
            likesSource: num(v.likeCount) != null ? ("data-api-lifetime" as const) : null,
            comments: num(v.commentCount),
            commentsSource: num(v.commentCount) != null ? ("data-api-lifetime" as const) : null,
          });
        }
      }

      if (!anySuccess && !old) {
        const combined = Object.entries(perDatasetErrors).map(([k,v])=>`${k}: ${v}`).join("; ");
        throw Error(combined || "All analytics queries failed");
      }

      const snap: YouTubeAnalyticsSnapshot = {
        schemaVersion: 1,
        channelId: channel.channelId,
        range,
        lastSuccessfulSyncAt: anySuccess ? new Date().toISOString() : old?.lastSuccessfulSyncAt ?? null,
        lastAttemptAt: new Date().toISOString(),
        timeSeries: (results["timeSeries"] as any) ?? old?.timeSeries ?? [],
        videos: (results["videos"] as any) ?? old?.videos ?? [],
        trafficSources: (results["trafficSources"] as any) ?? old?.trafficSources ?? [],
        countries: (results["countries"] as any) ?? old?.countries ?? [],
        devices: (results["devices"] as any) ?? old?.devices ?? [],
      };

      await this.write({ ...all, [range]: snap });
      const sanitizedError = Object.keys(perDatasetErrors).length ? sanitizeYouTubeError(Object.entries(perDatasetErrors).map(([k,v])=>`${k} unavailable: ${v}`).join("; ")) : null;
      return { ok: Object.keys(perDatasetErrors).length === 0, snapshot: snap, sanitizedError };
    } catch (e) {
      if (old) await this.write({ ...all, [range]: { ...old, lastAttemptAt: new Date().toISOString() } });
      return { ok: false, snapshot: old, sanitizedError: sanitizeYouTubeError(e instanceof Error ? e.message : "Analytics sync failed") };
    }
  }
  private async read(): Promise<Partial<Record<YouTubeAnalyticsRange, YouTubeAnalyticsSnapshot>> | null> { try { return JSON.parse(await readFile(this.file,"utf8")); } catch { return null; } }
  private async write(x: unknown) { await mkdir(path.dirname(this.file), { recursive: true }); const tmp = this.file + ".tmp"; await writeFile(tmp, JSON.stringify(x), { mode: 0o600 }); await rename(tmp, this.file); }
}
