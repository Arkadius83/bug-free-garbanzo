import { useEffect, useMemo, useState } from "react";
import type { ArtistAlias, PublishingQueueItem, ReleaseReadiness, ReleaseSummary, SoundCloudCatalogStatus, SoundCloudContentType, SoundCloudTrackPerformance, SoundCloudTrackSummary, SpotifyReleaseSummary } from "../../../electron/shared/contracts";
import { artists } from "../../data/artists";

export function AnalyticsPage({ releases, onOpenRelease }: { releases: ReleaseSummary[]; onOpenRelease: (release?: ReleaseSummary) => void }) {
  const [artist, setArtist] = useState<ArtistAlias | "all">("all");
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [tracks, setTracks] = useState<SoundCloudTrackSummary[]>([]);
  const [spotify, setSpotify] = useState<SpotifyReleaseSummary[]>([]);
  const [queue, setQueue] = useState<PublishingQueueItem[]>([]);
  const [readiness, setReadiness] = useState<Record<string, ReleaseReadiness>>({});
  const [performance, setPerformance] = useState<Record<number, SoundCloudTrackPerformance>>({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!window.studio) return;
    setMessage("Loading real catalog analytics...");
    void Promise.all([
      window.studio.listSoundCloudTracks(),
      window.studio.listSpotifyReleases(),
      window.studio.listPublishingQueue()
    ]).then(async ([savedTracks, savedSpotify, savedQueue]) => {
      setTracks(savedTracks);
      setSpotify(savedSpotify);
      setQueue(savedQueue);
      const [savedReadiness, savedPerformance] = await Promise.all([
        Promise.all(releases.map(async (release) => [release.id, await window.studio!.getReleaseReadiness(release.id)] as const)),
        Promise.all(savedTracks.map(async (track) => [track.id, await window.studio!.getSoundCloudTrackPerformance(track.id)] as const))
      ]);
      setReadiness(Object.fromEntries(savedReadiness));
      setPerformance(Object.fromEntries(savedPerformance));
      setMessage("");
    }).catch((error) => setMessage(error instanceof Error ? error.message : "Could not load analytics"));
  }, [releases]);

  const analyticsTracks = tracks.filter((track) => artist === "all" || track.artistId === artist);
  const analyticsReleases = releases.filter((release) => artist === "all" || release.artistId === artist);
  const analyticsSpotify = spotify.filter((release) => artist === "all" || release.artistId === artist);
  const analyticsQueue = queue.filter((item) => artist === "all" || analyticsReleases.some((release) => release.id === item.releaseId));
  const totals = analyticsTracks.reduce((total, track) => {
    const window = performance[track.id]?.windows.find((item) => item.days === period);
    return {
      plays: total.plays + (track.playbackCount ?? 0),
      likes: total.likes + (track.likesCount ?? 0),
      comments: total.comments + (track.commentCount ?? 0),
      reposts: total.reposts + (track.repostsCount ?? 0),
      playsDelta: total.playsDelta + (window?.playsDelta ?? 0),
      tracked: total.tracked + (window?.available ? 1 : 0)
    };
  }, { plays: 0, likes: 0, comments: 0, reposts: 0, playsDelta: 0, tracked: 0 });
  const ranked = useMemo(() => [...analyticsTracks].sort((a, b) => b.engagementScore - a.engagementScore || (b.playbackCount ?? 0) - (a.playbackCount ?? 0)).slice(0, 10), [analyticsTracks]);
  const contentTypes = (["original", "bootleg", "official-remix", "edit", "dj-set"] as SoundCloudContentType[]).map((type) => ({ type, count: analyticsTracks.filter((track) => track.contentType === type).length }));
  const catalogStatuses = (["unreviewed", "release", "gem", "archive", "exclude"] as SoundCloudCatalogStatus[]).map((status) => ({ status, count: analyticsTracks.filter((track) => track.catalogStatus === status).length }));
  const averageReadiness = analyticsReleases.length ? Math.round(analyticsReleases.reduce((sum, release) => sum + (readiness[release.id]?.score ?? 0), 0) / analyticsReleases.length) : 0;

  return <div className="page-content analytics-page">
    <header><div><span className="eyebrow">Analytics Dashboard V1</span><h1>Catalog intelligence.</h1><p>Real SoundCloud snapshots, Spotify catalog data and local campaign progress. No estimated stream counts.</p></div><div className="analytics-filters"><label>Artist alias<select value={artist} onChange={(event) => setArtist(event.target.value as ArtistAlias | "all")}><option value="all">All aliases</option>{artists.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></label><label>Trend window<select value={period} onChange={(event) => setPeriod(Number(event.target.value) as 7 | 30 | 90)}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label></div></header>
    {message && <p className="analytics-note">{message}</p>}
    <div className="analytics-kpis"><article><span>SoundCloud plays</span><b>{totals.plays.toLocaleString()}</b><em>{totals.tracked ? `${totals.playsDelta >= 0 ? "+" : ""}${totals.playsDelta.toLocaleString()} in ${period}d` : "collecting snapshots"}</em></article><article><span>Interactions</span><b>{(totals.likes + totals.comments + totals.reposts).toLocaleString()}</b><small>{totals.likes.toLocaleString()} likes</small></article><article><span>Imported tracks</span><b>{analyticsTracks.length}</b><small>{analyticsTracks.filter((track) => track.artistId).length} assigned</small></article><article><span>Spotify releases</span><b>{analyticsSpotify.length}</b><small>catalog entries only</small></article><article><span>Release readiness</span><b>{averageReadiness}%</b><small>{analyticsReleases.length} local releases</small></article><article><span>Campaign posts</span><b>{analyticsQueue.length}</b><small>{analyticsQueue.filter((item) => item.status === "scheduled").length} scheduled · {analyticsQueue.filter((item) => item.status === "published").length} published</small></article></div>
    <div className="analytics-grid">
      <section className="panel analytics-panel"><span className="eyebrow">Performance ranking</span><h2>Tracks worth your attention</h2>{ranked.length ? <div className="analytics-ranking">{ranked.map((track, index) => { const window = performance[track.id]?.windows.find((item) => item.days === period); return <article key={track.id}><span>{index + 1}</span><div><strong>{track.title}</strong><small>{artists.find((profile) => profile.id === track.artistId)?.name ?? "Unassigned"} · {track.contentType} · {track.catalogStatus}</small></div><b>{(track.playbackCount ?? 0).toLocaleString()}<small>plays</small></b><b>{track.engagementRate === null ? "—" : `${track.engagementRate}%`}<small>engagement</small></b><b>{window?.available ? `${(window.playsDelta ?? 0) >= 0 ? "+" : ""}${window.playsDelta}` : "—"}<small>{period}d plays</small></b></article>; })}</div> : <div className="analytics-empty">No SoundCloud tracks match this alias.</div>}</section>
      <section className="panel analytics-panel"><span className="eyebrow">Catalog structure</span><h2>Rights and classification</h2><div className="analytics-bars">{contentTypes.map((item) => <div key={item.type}><div className="analytics-bar-head"><span>{item.type.replace("official-remix", "official remix")}</span><b>{item.count}</b></div><div className="analytics-bar-track"><i style={{ width: `${analyticsTracks.length ? item.count / analyticsTracks.length * 100 : 0}%` }} /></div></div>)}</div><h2>Editorial status</h2><div className="analytics-bars">{catalogStatuses.map((item) => <div key={item.status}><div className="analytics-bar-head"><span>{item.status}</span><b>{item.count}</b></div><div className="analytics-bar-track"><i style={{ width: `${analyticsTracks.length ? item.count / analyticsTracks.length * 100 : 0}%` }} /></div></div>)}</div></section>
      <section className="panel analytics-panel analytics-readiness"><span className="eyebrow">Release operations</span><h2>Readiness and next blockers</h2>{analyticsReleases.length ? <div className="analytics-readiness-list">{analyticsReleases.map((release) => { const releaseReadiness = readiness[release.id]; const score = releaseReadiness?.score ?? 0; return <article key={release.id} onClick={() => onOpenRelease(release)}><div><strong>{release.title}</strong><span>{score}%</span></div><p>{release.artistName} · {release.status} · {releaseReadiness?.missing[0] ?? "Ready for campaign"}</p><div className="analytics-progress"><i style={{ width: `${score}%` }} /></div></article>; })}</div> : <div className="analytics-empty">No local releases for this alias.</div>}</section>
    </div>
  </div>;
}
