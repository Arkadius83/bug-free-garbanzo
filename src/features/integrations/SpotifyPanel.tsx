import type { ArtistAlias, CatalogMatchSuggestion, ReleaseSummary, SpotifyConnection, SpotifyReleaseSummary } from "../../../electron/shared/contracts";
import { artists } from "../../data/artists";

type Props = {
  spotify: SpotifyConnection | null;
  clientId: string;
  artistIds: Record<ArtistAlias, string>;
  releases: ReleaseSummary[];
  spotifyReleases: SpotifyReleaseSummary[];
  matches: CatalogMatchSuggestion[];
  message: string;
  busy: boolean;
  onClientIdChange: (value: string) => void;
  onArtistIdsChange: (value: Record<ArtistAlias, string>) => void;
  onSave: () => void;
  onConnect: () => void;
  onSync: () => void;
  onAcceptMatch: (match: CatalogMatchSuggestion) => void;
  onLinkRelease: (release: SpotifyReleaseSummary, releaseId: string | null) => void;
};

export function SpotifyPanel({ spotify, clientId, artistIds, releases, spotifyReleases, matches, message, busy, onClientIdChange, onArtistIdsChange, onSave, onConnect, onSync, onAcceptMatch, onLinkRelease }: Props) {
  return <section className="panel spotify-panel">
    <div className="integration-title"><span className="spotify-mark">●</span><div><h2>Spotify catalog</h2><p>Development Mode · Authorization Code with PKCE · Premium required</p></div><span className={`connection-badge ${spotify?.connected ? "connected" : ""}`}>{spotify?.connected ? `● ${spotify.displayName}` : "○ NOT CONNECTED"}</span></div>
    <div className="spotify-setup-grid"><div><div className="callback-box"><small>REDIRECT URI — add this exact address in Spotify Developer Dashboard</small><code>{spotify?.callbackUrl ?? "http://127.0.0.1:43821/callback"}</code></div><label>Spotify Client ID<input placeholder={spotify?.configured ? "Client ID already configured" : "Paste Client ID"} value={clientId} onChange={(event) => onClientIdChange(event.target.value)} /></label></div><div className="artist-id-grid">{artists.map((artist) => <label key={artist.id}>{artist.name}<input placeholder="Spotify artist URL or ID" value={artistIds[artist.id]} onChange={(event) => onArtistIdsChange({ ...artistIds, [artist.id]: event.target.value })} /></label>)}</div></div>
    <div className="integration-actions"><button disabled={busy || (!clientId.trim() && !Object.values(artistIds).some((value) => value.trim()))} onClick={() => void onSave()}>Save configuration</button><button className="primary" disabled={busy || !spotify?.configured || spotify.connected} onClick={() => void onConnect()}>Connect Spotify</button><button className="primary" disabled={busy || !spotify?.connected || !Object.values(artistIds).some((value) => value.trim())} onClick={() => void onSync()}>Sync Spotify catalog</button></div>
    {message && <p className="integration-message">{message}</p>}
    <div className="match-panel"><div><span className="eyebrow">Unified catalog suggestions</span><h3>{matches.length} possible matches</h3><p>Bootlegs and DJ sets are excluded automatically.</p></div>{matches.slice(0, 8).map((match) => <article key={`${match.soundCloudTrackId}-${match.spotifyReleaseId}`}><div><strong>{match.soundCloudTitle}</strong><span>SoundCloud</span></div><b>{match.score}%</b><div><strong>{match.spotifyTitle}</strong><span>Spotify · {match.reason}</span></div><button onClick={() => void onAcceptMatch(match)}>Confirm match</button></article>)}{matches.length === 0 && <small>No safe unlinked matches found. Change incorrect Bootleg classifications to Original before matching.</small>}</div>
    <div className="spotify-release-grid">{spotifyReleases.map((release) => <article key={release.id}>{release.imageUrl ? <img src={release.imageUrl} alt="" /> : <span>♫</span>}<div><strong>{release.name}</strong><small>{artists.find((artist) => artist.id === release.artistId)?.name} · {release.albumType} · {release.releaseDate} · {release.totalTracks} tracks</small><select value={release.releaseId ?? ""} onChange={(event) => void onLinkRelease(release, event.target.value || null)}><option value="">Not linked to Release Manager</option>{releases.filter((local) => !spotifyReleases.some((item) => item.releaseId === local.id && item.id !== release.id)).map((local) => <option value={local.id} key={local.id}>{local.title}</option>)}</select>{release.releaseId && <b>Unified: {release.releaseTitle}</b>}</div></article>)}</div>
  </section>;
}
