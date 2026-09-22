import type { DatabaseHealth, MetaConnection, PublishingQueueItem, ScheduleEvent, SoundCloudConnection, SpotifyConnection, SystemStatus, YouTubeAnalyticsRange, YouTubeAnalyticsSnapshot, YouTubeChannelDataSnapshot, YouTubeConnection } from "../../../electron/shared/contracts";
import { StatusBadge, type StatusBadgeTone } from "../../ui/StatusBadge";
import { SurfacePanel } from "../../ui/SurfacePanel";

type Props = { queue?: PublishingQueueItem[]; events?: ScheduleEvent[]; meta?: MetaConnection | null; soundCloud?: SoundCloudConnection | null; spotify?: SpotifyConnection | null; youTube?: YouTubeConnection | null; youTubeData?: YouTubeChannelDataSnapshot | null; youTubeAnalytics?: YouTubeAnalyticsSnapshot | null; youTubeAnalyticsRange?: YouTubeAnalyticsRange; system?: SystemStatus | null; database?: DatabaseHealth | null; readinessMissing?: string[]; };
type Tone = StatusBadgeTone;
const tone = (ready: boolean | null): Tone => ready === true ? "success" : ready === false ? "warning" : "neutral";
const label = (ready: boolean | null) => ready === true ? "Connected" : ready === false ? "Not connected" : "Unavailable";
function youTubeState(connection: YouTubeConnection | null | undefined): boolean | null {
  if (!connection) return null;
  if (connection.connected) return true;
  if (connection.configured) return false;
  return null;
}

export function DashboardOperations({ queue = [], events = [], meta = null, soundCloud = null, spotify = null, youTube = null, youTubeData = null, youTubeAnalytics = null, youTubeAnalyticsRange = "28d", system = null, database = null, readinessMissing = [] }: Props) {
  const scheduled = events.filter((event) => event.status === "SCHEDULED").length;
  const ready = events.filter((event) => event.status === "READY").length;
  const approved = queue.filter((item) => item.status === "approved" || item.status === "scheduled" || item.status === "published").length;
  const failed = queue.filter((item) => item.status === "failed");
  const recommendations = [...readinessMissing.map((item) => `Complete ${item.toLowerCase()}`), ...(scheduled === 0 ? ["Schedule approved content"] : []), ...(!meta?.connected ? ["Connect Meta publishing"] : [])].slice(0, 4);
  const blockers = [...readinessMissing.map((item) => ({ text: item, tone: "warning" as Tone })), ...failed.map((item) => ({ text: `${item.platform} publishing needs attention`, tone: "danger" as Tone }))].slice(0, 4);
  const youTubeConnected = youTubeState(youTube);
  // Only use cached data if it matches currently connected channelId
  const effectiveYouTubeData = youTube?.channelId && youTubeData?.channelId === youTube.channelId ? youTubeData : null;
  const youTubeSubtitle = (() => {
    if (youTube?.connected && effectiveYouTubeData?.channel) {
      const ch = effectiveYouTubeData.channel;
      const parts: string[] = [];
      if (ch.title) parts.push(ch.title);
      if (ch.channelId) parts.push(ch.channelId);
      return parts.join(" · ");
    }
    if (youTube?.connected) return `${youTube.channelTitle ?? ""}${youTube.channelId ? ` · ${youTube.channelId}` : ""}`.trim() || null;
    if (youTube?.configured) return "Configured · Not connected";
    return null;
  })();
  const youTubeMetricsLine = (() => {
    if (!youTube?.connected) return null;
    if (!effectiveYouTubeData?.channel || !effectiveYouTubeData.lastSuccessfulSyncAt) return "Metrics not synced yet";
    const ch = effectiveYouTubeData.channel;
    const subs = ch.hiddenSubscriberCount ? "Subscribers hidden" : ch.subscriberCount != null ? `${ch.subscriberCount.toLocaleString()} subscribers` : null;
    const views = ch.viewCount != null ? `${ch.viewCount.toLocaleString()} views` : null;
    const count = ch.videoCount != null ? `${ch.videoCount} videos` : null;
    const latest = [...effectiveYouTubeData.videos].sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? "") || 0)[0];
    const latestLine = latest ? `Latest: ${latest.title} · ${latest.viewCount != null ? `${latest.viewCount.toLocaleString()} views` : "views —"}` : null;
    return [subs, views, count, latestLine].filter(Boolean).join(" · ") || "Metrics not synced yet";
  })();
  const platforms: Array<{ name: string; connected: boolean | null; subtitle?: string | null; metrics?: string | null }> = [
    { name: "Spotify", connected: spotify?.connected ?? null },
    { name: "SoundCloud", connected: soundCloud?.connected ?? null },
    { name: "Instagram", connected: meta?.destinations.some((item) => item.platform === "Instagram") ?? null },
    { name: "Facebook", connected: meta?.destinations.some((item) => item.platform === "Facebook") ?? null },
    { name: "YouTube", connected: youTubeConnected, subtitle: youTubeSubtitle, metrics: youTubeMetricsLine },
    { name: "TikTok", connected: null },
    { name: "DistroKid", connected: null }
  ];
  const upcoming = [...events].filter((event) => event.status !== "CANCELLED" && new Date(event.scheduledAt).getTime() >= Date.now()).sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)).slice(0, 4);
  return <>
    <section className="dashboard-operations-grid">
      <SurfacePanel className="dashboard-operation-panel platform-performance">
        <div className="dashboard-panel-heading"><span className="dashboard-eyebrow">Platform performance</span><small>Connection state</small></div>
        <div className="platform-status-list">{platforms.map(({ name, connected, subtitle, metrics }) => <div key={name}><div style={{ display: "grid", gap: 2 }}><strong>{name}</strong>{subtitle ? <small style={{ color: "var(--ui-text-muted, #6b7a94)", fontSize: "0.58rem" }}>{subtitle}</small> : null}{metrics ? <small style={{ color: "var(--ui-text-muted, #6b7a94)", fontSize: "0.58rem", opacity: 0.85 }}>{metrics}</small> : null}</div><StatusBadge label={label(connected)} tone={tone(connected)} /></div>)}</div>
      </SurfacePanel>
      <SurfacePanel className="dashboard-operation-panel campaign-performance" aria-label="YouTube Analytics">
        <div className="dashboard-panel-heading"><span className="dashboard-eyebrow">YouTube analytics · last {youTubeAnalyticsRange}</span><small>Period metrics</small></div>
        {youTube?.connected && youTubeAnalytics?.channelId === youTube.channelId && youTubeAnalytics.range === youTubeAnalyticsRange && youTubeAnalytics.lastSuccessfulSyncAt ? <div className="youtube-analytics-overview">{(() => { const points=youTubeAnalytics.timeSeries; const sum=(key:"views"|"estimatedMinutesWatched"|"likes"|"comments")=>points.reduce((total,point)=>total+(point[key]??0),0); const avg=points.length?points.reduce((total,point)=>total+(point.averageViewDuration??0),0)/points.length:null; const chart=(key:"views"|"estimatedMinutesWatched")=>{const max=Math.max(1,...points.map(point=>point[key]??0));return <div className="youtube-analytics-chart" aria-label={`${key} over time`}>{points.map(point=><i key={point.day} title={`${point.day}: ${point[key]??"—"}`} style={{height:`${Math.max(4,((point[key]??0)/max)*100)}%`}} />)}</div>}; return <><div className="youtube-analytics-metrics"><span>Views · {youTubeAnalyticsRange}<b>{sum("views").toLocaleString()}</b></span><span>Watch time · {youTubeAnalyticsRange}<b>{sum("estimatedMinutesWatched").toLocaleString()} min</b></span><span>Avg view duration<b>{avg==null?"—":`${Math.round(avg)} sec`}</b></span><span>Likes<b>{sum("likes").toLocaleString()}</b></span><span>Comments<b>{sum("comments").toLocaleString()}</b></span><span>Top video<b>{youTubeAnalytics.videos[0]?.title??"—"}</b></span></div><div className="youtube-analytics-charts"><div><small>Views over time</small>{chart("views")}</div><div><small>Watch time over time</small>{chart("estimatedMinutesWatched")}</div></div><div className="youtube-analytics-lists"><div><strong>Traffic sources</strong>{youTubeAnalytics.trafficSources.map(item=><small key={item.source}>{item.source} · {item.views?.toLocaleString()??"—"}</small>)}</div><div><strong>Top countries</strong>{youTubeAnalytics.countries.map(item=><small key={item.country}>{item.country} · {item.views?.toLocaleString()??"—"}</small>)}</div><div><strong>Devices</strong>{youTubeAnalytics.devices.map(item=><small key={item.device}>{item.device} · {item.views?.toLocaleString()??"—"}</small>)}</div></div></>})()}</div> : <p className="dashboard-empty-copy">Analytics not synced yet</p>}
      </SurfacePanel>      <SurfacePanel className="dashboard-operation-panel campaign-performance">
        <div className="dashboard-panel-heading"><span className="dashboard-eyebrow">Campaign performance</span><small>Publishing activity</small></div>
        {queue.length ? <div className="campaign-counts"><span><b>{scheduled}</b> scheduled</span><span><b>{approved}</b> approved</span><span><b>{failed.length}</b> needs retry</span></div> : <p className="dashboard-empty-copy">Analytics will appear after connected campaigns begin publishing.</p>}
      </SurfacePanel>
      <SurfacePanel className="dashboard-operation-panel recommendations">
        <div className="dashboard-panel-heading"><span className="dashboard-eyebrow">Recommendations</span><small>Derived from workspace state</small></div>
        {recommendations.length ? <ul className="dashboard-action-list">{recommendations.map((item) => <li key={item}><i />{item}</li>)}</ul> : <p className="dashboard-empty-copy">No actionable recommendation can be derived yet.</p>}
      </SurfacePanel>
      <SurfacePanel className="dashboard-operation-panel blockers">
        <div className="dashboard-panel-heading"><span className="dashboard-eyebrow">Blockers & alerts</span><small>{blockers.length ? "Attention needed" : "Clear"}</small></div>
        {blockers.length ? <ul className="dashboard-blocker-list">{blockers.map((item) => <li key={item.text}><StatusBadge label={item.tone === "danger" ? "Danger" : "Review"} tone={item.tone} />{item.text}</li>)}</ul> : <p className="dashboard-empty-copy">No release or publishing blocker is currently reported.</p>}
      </SurfacePanel>
      <SurfacePanel className="dashboard-operation-panel upcoming">
        <div className="dashboard-panel-heading"><span className="dashboard-eyebrow">Upcoming schedule</span><small>Calendar events</small></div>
        {upcoming.length ? <ol className="dashboard-schedule-list">{upcoming.map((event) => <li key={event.id}><time>{new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: event.timezone }).format(new Date(event.scheduledAt))}</time><div><strong>{event.campaignItemTitle}</strong><span>{event.platform} · {event.releaseTitle}</span></div><StatusBadge label={event.status} tone={event.status === "READY" ? "success" : "cyan"} /></li>)}</ol> : <p className="dashboard-empty-copy">No upcoming schedule event.</p>}
      </SurfacePanel>
    </section>
    <SurfacePanel className="dashboard-system-strip">
      <div><span className="dashboard-eyebrow">System & integration status</span><strong>Local operations</strong></div>
      <StatusBadge label={system?.ollama.available ? "AI engine ready" : "AI engine unavailable"} tone={system?.ollama.available ? "success" : "warning"} />
      <StatusBadge label={database?.ready ? "Database ready" : "Database pending"} tone={database?.ready ? "success" : "warning"} />
      <StatusBadge label={meta?.connected ? "Publishing connected" : "Publishing setup required"} tone={meta?.connected ? "success" : "neutral"} />
    </SurfacePanel>
  </>;
}
