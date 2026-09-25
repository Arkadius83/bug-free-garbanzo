import { useEffect, useState } from "react";
import { InterfacePreferencesPanel } from "../../ui/InterfacePreferencesPanel";
import type { ArtistAlias, KlingCliStatus, LocalServiceStatus, MediaBridgeStatus, MediaGenerationSettings, MetaConnection, SoundCloudConnection, SpotifyConnection, YouTubeConnection, TikTokConnection, YouTubeChannelDataSnapshot, TikTokUserProfile, BrandProfile, MediaAspectRatio } from "../../../electron/shared/contracts";
import { artists } from "../../data/artists";
import { Tabs } from "../../ui/Tabs";
import { PageHeader } from "../../ui/PageHeader";
import { PlatformIcon } from "../dashboard/PlatformIcon";
import "./settings.css";

type SettingsSection = "general" | "connections" | "ai-media" | "local-services" | "infrastructure";

const sectionTabs = [
  { id: "general", label: "General" },
  { id: "connections", label: "Connections" },
  { id: "ai-media", label: "AI & Media" },
  { id: "local-services", label: "Local Services" },
  { id: "infrastructure", label: "Infrastructure" },
];

interface SettingsPageProps {
  status: import("../../../electron/shared/contracts").SystemStatus | null;
  onNavigate: (view: string) => void;
}

export function SettingsPage({ status, onNavigate }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  return (
    <div className="settings-page v4-page">
      <nav className="settings-nav">
        <h2>Settings</h2>
        {sectionTabs.map((tab) => (
          <button key={tab.id} className={activeSection === tab.id ? "active" : ""} onClick={() => setActiveSection(tab.id as SettingsSection)}>
            <span>{tab.id === "general" ? "⚙" : tab.id === "connections" ? "◎" : tab.id === "ai-media" ? "✦" : tab.id === "local-services" ? "▶" : "☁"}</span>
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="settings-content">
        {activeSection === "general" && <GeneralSection onNavigate={onNavigate} />}
        {activeSection === "connections" && <ConnectionsSection />}
        {activeSection === "ai-media" && <AiMediaSection />}
        {activeSection === "local-services" && <LocalServicesSection />}
        {activeSection === "infrastructure" && <InfrastructureSection />}
      </div>
    </div>
  );
}

function GeneralSection({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [brandDraft, setBrandDraft] = useState<BrandProfile | null>(null);
  const [brandMessage, setBrandMessage] = useState("");
  const [developerModeEnabled, setDeveloperModeEnabled] = useState(true);

  useEffect(() => {
    if (!window.studio) return;
    void window.studio.listBrandProfiles().then((profiles) => {
      setBrandProfiles(profiles);
      setBrandDraft((current) => profiles.find((p) => p.artistId === current?.artistId) ?? profiles[0] ?? null);
    }).catch(() => undefined);
  }, []);

  async function saveBrandProfile() {
    if (!window.studio || !brandDraft) return;
    setBrandMessage("Saving...");
    try {
      const updated = await window.studio.updateBrandProfile(brandDraft);
      setBrandProfiles((current) => current.map((p) => p.artistId === updated.artistId ? updated : p));
      setBrandDraft(updated);
      setBrandMessage(`${updated.artistName} brand profile saved.`);
    } catch (error) { setBrandMessage(error instanceof Error ? error.message : "Could not save"); }
  }

  return (
    <>
      <header><h1>General</h1><p>Brand profiles, prompt templates and developer tools.</p></header>
      <InterfacePreferencesPanel />
      <div className="settings-section">
        <h2>Brand Profiles</h2>
        <p className="settings-hint">Visual identity rules are added to approved image and video prompts before generation.</p>
        <div className="brand-layout">
          <div className="brand-list">
            {brandProfiles.map((profile) => (
              <button key={profile.artistId} className={`brand-list-item${brandDraft?.artistId === profile.artistId ? " selected" : ""}`} style={{ borderColor: brandDraft?.artistId === profile.artistId ? "#8753d8" : undefined }} onClick={() => setBrandDraft(profile)}>
                <strong>{profile.artistName}</strong>
                <span>{profile.defaultAspectRatio} · {profile.palette}</span>
              </button>
            ))}
          </div>
          {brandDraft && (
            <div className="settings-card">
              <h3>{brandDraft.artistName} — Visual Identity</h3>
              <div className="settings-row">
                <label className="settings-label">Default format
                  <select className="settings-select-inline" value={brandDraft.defaultAspectRatio} onChange={(e) => setBrandDraft({ ...brandDraft, defaultAspectRatio: e.target.value as MediaAspectRatio })}>
                    {(["1:1", "4:5", "9:16", "16:9"] as MediaAspectRatio[]).map((r) => <option key={r}>{r}</option>)}
                  </select>
                </label>
              </div>
              <label className="settings-label" style={{ marginTop: 10 }}>Visual direction
                <textarea rows={3} className="settings-textarea" value={brandDraft.visualDirection} onChange={(e) => setBrandDraft({ ...brandDraft, visualDirection: e.target.value })} />
              </label>
              <div className="settings-grid-2-gap">
                <label className="settings-label">Color palette
                  <textarea rows={3} className="settings-textarea" value={brandDraft.palette} onChange={(e) => setBrandDraft({ ...brandDraft, palette: e.target.value })} />
                </label>
                <label className="settings-label">Typography
                  <textarea rows={3} className="settings-textarea" value={brandDraft.typography} onChange={(e) => setBrandDraft({ ...brandDraft, typography: e.target.value })} />
                </label>
              </div>
              <label className="settings-label" style={{ marginTop: 10 }}>Required elements
                <textarea rows={3} className="settings-textarea" value={brandDraft.requiredElements} onChange={(e) => setBrandDraft({ ...brandDraft, requiredElements: e.target.value })} />
              </label>
              <label className="settings-label" style={{ marginTop: 10 }}>Forbidden elements
                <textarea rows={3} className="settings-textarea" value={brandDraft.forbiddenElements} onChange={(e) => setBrandDraft({ ...brandDraft, forbiddenElements: e.target.value })} />
              </label>
              <label className="settings-label" style={{ marginTop: 10 }}>Negative prompts
                <textarea rows={2} className="settings-textarea" value={brandDraft.negativePrompt} onChange={(e) => setBrandDraft({ ...brandDraft, negativePrompt: e.target.value })} />
              </label>
              <div className="settings-row">
                <button className="primary" onClick={() => void saveBrandProfile()}>Save brand profile</button>
                {brandMessage && <span className="settings-hint">{brandMessage}</span>}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="settings-section">
        <h2>Developer Tools</h2>
        <div className="settings-card">
          <div className="settings-row-between">
            <div><h3>Execution Monitor</h3><p>Developer diagnostics for harness plan execution.</p></div>
            <label className="settings-toggle-label">
              <input type="checkbox" checked={developerModeEnabled} onChange={(e) => setDeveloperModeEnabled(e.target.checked)} style={{ width: "auto" }} />
              Developer Mode
            </label>
          </div>
          {developerModeEnabled && (
            <div className="settings-indent">
              <button className="settings-back-link" onClick={() => onNavigate("ai-studio")}>← Open AI Studio for harness execution</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ConnectionsSection() {
  const [activeTab, setActiveTab] = useState("soundcloud");
  const tabs = [
    { id: "soundcloud", label: "SoundCloud" },
    { id: "spotify", label: "Spotify" },
    { id: "meta", label: "Meta" },
    { id: "youtube", label: "YouTube" },
    { id: "tiktok", label: "TikTok" },
  ];
  return (
    <>
      <PageHeader eyebrow="Settings" title="Connections" lead="OAuth credentials, account state and supported publishing capabilities." />
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} ariaLabel="Connection platforms" />
      <div className="settings-tabs-spacer">
        {activeTab === "soundcloud" && <SoundCloudConnectionSection />}
        {activeTab === "spotify" && <SpotifyConnectionSection />}
        {activeTab === "meta" && <MetaConnectionSection />}
        {activeTab === "youtube" && <YouTubeConnectionSection />}
        {activeTab === "tiktok" && <TikTokConnectionSection />}
      </div>
    </>
  );
}

function SoundCloudConnectionSection() {
  const [connection, setConnection] = useState<SoundCloudConnection | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!window.studio) return;
    void window.studio.getSoundCloudConnection().then(setConnection).catch(() => undefined);
  }, []);

  async function saveCredentials() {
    if (!window.studio) return;
    setBusy(true); setMessage("Saving...");
    try {
      setConnection(await window.studio.saveSoundCloudCredentials(clientId, clientSecret));
      setClientSecret(""); setMessage("Credentials saved securely.");
    } catch (error) { setMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not save"); }
    finally { setBusy(false); }
  }

  async function connect() {
    if (!window.studio) return;
    setBusy(true); setMessage("Complete authorization in the browser...");
    try {
      await window.studio.beginSoundCloudConnect();
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const c = await window.studio.getSoundCloudConnection(); setConnection(c);
        if (c.connected) { setMessage(`Connected as ${c.username}.`); return; }
        if (c.error) throw new Error(c.error);
      }
      throw new Error("Authorization timed out.");
    } catch (error) { setMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Connection failed"); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    if (!window.studio) return;
    setBusy(true);
    try { setConnection(await window.studio.disconnectSoundCloud()); setMessage("Disconnected. Catalog remains available locally."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not disconnect"); }
    finally { setBusy(false); }
  }

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <div><h3>SoundCloud Artist Pro</h3><p className="settings-card-subtitle">OAuth 2.1 · credentials encrypted by Windows</p></div>
        <span className={`connection-status ${connection?.connected ? "connected" : ""}`}><span className="dot" />{connection?.connected ? "CONNECTED" : "NOT CONNECTED"}</span>
      </div>
      <details className="integration-diagnostics"><summary>Connection details</summary><div className="callback-display"><small>CALLBACK URL</small><code>{connection?.callbackUrl ?? "ai-studio-manager://soundcloud/callback"}</code></div></details>
      <div className="credential-fields">
        <label>Client ID<input autoComplete="off" placeholder={connection?.configured ? "Already configured" : "Paste Client ID"} value={clientId} onChange={(e) => setClientId(e.target.value)} /></label>
        <label>Client Secret<input type="password" autoComplete="new-password" placeholder={connection?.configured ? "Replace only when needed" : "Paste Client Secret"} value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} /></label>
      </div>
      <div className="settings-row">
        <button disabled={busy || !clientId.trim() || !clientSecret.trim()} onClick={() => void saveCredentials()}>Save credentials</button>
        <button className="primary" disabled={busy || !connection?.configured || connection.connected} onClick={() => void connect()}>{busy ? "Working..." : "Connect"}</button>
        {connection?.connected && <button className="danger-button" disabled={busy} onClick={() => void disconnect()}>Disconnect</button>}
      </div>
      {connection?.connected && <div className="connected-info"><span>✓</span><div><strong>{connection.username}</strong><small>{connection.permalinkUrl}</small></div></div>}
      {message && <p className="settings-message">{message}</p>}
    </div>
  );
}

function SpotifyConnectionSection() {
  const [connection, setConnection] = useState<SpotifyConnection | null>(null);
  const [clientId, setClientId] = useState("");
  const [artistIds, setArtistIds] = useState<Record<ArtistAlias, string>>({ "the-arkadiusz": "", arkadelic: "", "ar-tek": "", "echoes-of-arcadia": "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!window.studio) return;
    void Promise.all([window.studio.getSpotifyConnection(), window.studio.getSpotifyArtistMappings()]).then(([conn, mappings]) => {
      setConnection(conn);
      setArtistIds((current) => ({ ...current, ...Object.fromEntries(mappings.map((m) => [m.artistId, m.spotifyArtistId])) }));
    }).catch(() => undefined);
  }, []);

  async function saveConfig() {
    if (!window.studio) return; setBusy(true);
    try {
      if (clientId.trim()) setConnection(await window.studio.saveSpotifyClientId(clientId));
      await window.studio.saveSpotifyArtistMappings(artists.flatMap((a) => artistIds[a.id].trim() ? [{ artistId: a.id, spotifyArtistId: artistIds[a.id] }] : []));
      setClientId(""); setMessage("Spotify configuration saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not save"); }
    finally { setBusy(false); }
  }

  async function connect() {
    if (!window.studio) return; setBusy(true); setMessage("Authorize in the browser...");
    try {
      await window.studio.beginSpotifyConnect();
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const c = await window.studio.getSpotifyConnection(); setConnection(c);
        if (c.connected) { setMessage(`Connected as ${c.displayName}.`); return; }
        if (c.error) throw new Error(c.error);
      }
      throw new Error("Authorization timed out");
    } catch (error) { setMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Connection failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <div><h3>Spotify</h3><p className="settings-card-subtitle">Development Mode · PKCE · Premium required</p></div>
        <span className={`connection-status ${connection?.connected ? "connected" : ""}`}><span className="dot" />{connection?.connected ? connection.displayName : "NOT CONNECTED"}</span>
      </div>
      <details className="integration-diagnostics"><summary>Connection details</summary><div className="callback-display"><small>REDIRECT URI</small><code>{connection?.callbackUrl ?? "http://127.0.0.1:43821/callback"}</code></div></details>
      <div className="credential-fields">
        <label>Client ID<input placeholder={connection?.configured ? "Already configured" : "Paste Client ID"} value={clientId} onChange={(e) => setClientId(e.target.value)} /></label>
      </div>
      <div className="credential-fields-grid-2" style={{ gap: 8, marginTop: 12 }}>
        {artists.map((a) => (
          <label key={a.id} style={{ color: "#b9c1cb", fontSize: 10, fontWeight: 700 }}>{a.name}
            <input style={{ width: "100%", marginTop: 4, fontSize: 11 }} placeholder="Spotify artist URL or ID" value={artistIds[a.id]} onChange={(e) => setArtistIds((c) => ({ ...c, [a.id]: e.target.value }))} />
          </label>
        ))}
      </div>
      <div className="settings-row">
        <button disabled={busy} onClick={() => void saveConfig()}>Save configuration</button>
        <button className="primary" disabled={busy || !connection?.configured || connection.connected} onClick={() => void connect()}>Connect Spotify</button>
      </div>
      {message && <p className="settings-message">{message}</p>}
    </div>
  );
}

function MetaConnectionSection() {
  const [connection, setConnection] = useState<MetaConnection | null>(null);
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [configId, setConfigId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!window.studio) return;
    void window.studio.getMetaConnection().then((c) => { setConnection(c); setConfigId(c.configurationId ?? ""); }).catch(() => undefined);
  }, []);

  async function saveCredentials() {
    if (!window.studio) return; setBusy(true);
    try {
      const saved = await window.studio.saveMetaCredentials(appId, appSecret, configId);
      setConnection(saved); setConfigId(saved.configurationId ?? ""); setAppSecret("");
      setMessage("Meta credentials saved securely.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save"); }
    finally { setBusy(false); }
  }

  async function connect() {
    if (!window.studio) return; setBusy(true); setMessage("Authorize in the browser...");
    try {
      await window.studio.beginMetaConnect();
      for (let i = 0; i < 180; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const c = await window.studio.getMetaConnection(); setConnection(c);
        if (c.connected) { setMessage(`Connected ${c.destinations.length} destinations.`); return; }
        if (c.error) throw new Error(c.error);
      }
      throw new Error("Authorization timed out");
    } catch (error) { setMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Connection failed"); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    if (!window.studio) return;
    setConnection(await window.studio.disconnectMeta()); setMessage("Meta disconnected locally.");
  }

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <div className="integration-heading"><PlatformIcon name="Facebook" /><div><h3>Meta (Facebook + Instagram)</h3><p className="settings-card-subtitle">Graph API · feed publishing to authorized destinations</p></div></div>
        <span className={`connection-status ${connection?.connected ? "connected" : ""}`}><span className="dot" />{connection?.connected ? `${connection.destinations.length} DESTINATIONS` : "NOT CONNECTED"}</span>
      </div>
      <details className="integration-diagnostics"><summary>Connection details</summary><div className="callback-display"><small>REDIRECT URI</small><code>{connection?.callbackUrl ?? "http://localhost:43822/callback"}</code></div></details>
      <div className="credential-fields">
        <label>App ID<input placeholder={connection?.configured ? "Already configured" : "Paste Meta App ID"} value={appId} onChange={(e) => setAppId(e.target.value)} /></label>
        <label>App Secret<input type="password" autoComplete="new-password" placeholder={connection?.configured ? "Replace only when needed" : "Paste App Secret"} value={appSecret} onChange={(e) => setAppSecret(e.target.value)} /></label>
        <label>Configuration ID<input placeholder="Business Login Configuration ID" value={configId} onChange={(e) => setConfigId(e.target.value)} /></label>
      </div>
      <div className="settings-row">
        <button disabled={busy || !configId.trim()} onClick={() => void saveCredentials()}>Save credentials</button>
        <button className="primary" disabled={busy || !connection?.configured || connection.connected} onClick={() => void connect()}>Connect Meta</button>
        {connection?.connected && <button className="danger-button" disabled={busy} onClick={() => void disconnect()}>Disconnect</button>}
      </div>
      {connection?.connected && connection.destinations.length > 0 && (
        <div className="destination-list">
          {connection.destinations.map((d) => (
            <div key={d.id} className="connected-info connected-info-subtle">
              <span style={{ color: "#1877f2" }}>{d.platform === "Facebook" ? "f" : "◎"}</span>
              <div><strong>{d.username ? `@${d.username}` : d.name}</strong><small>{d.platform}</small></div>
            </div>
          ))}
        </div>
      )}
      {message && <p className="settings-message">{message}</p>}
    </div>
  );
}

function YouTubeConnectionSection() {
  const [connection, setConnection] = useState<YouTubeConnection | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [channelData, setChannelData] = useState<YouTubeChannelDataSnapshot | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [dataBusy, setDataBusy] = useState(false);

  useEffect(() => {
    if (!window.studio) return;
    void Promise.all([window.studio.getYouTubeConnection(), window.studio.getYouTubeChannelData()]).then(([c, d]) => { setConnection(c); setChannelData(d); }).catch(() => undefined);
  }, []);

  async function saveCredentials() {
    if (!window.studio) return; setBusy(true);
    try { const saved = await window.studio.saveYouTubeCredentials(clientId, clientSecret); setConnection(saved); setClientSecret(""); setMessage("YouTube credentials saved."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save"); }
    finally { setBusy(false); }
  }

  async function connect() {
    if (!window.studio) return; setBusy(true); setMessage("Authorize in the browser...");
    try {
      await window.studio.beginYouTubeConnect();
      for (let i = 0; i < 180; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const c = await window.studio.getYouTubeConnection(); setConnection(c);
        if (c.connected) { setMessage(`Connected: ${c.channelTitle}`); return; }
        if (c.error) throw new Error(c.error);
      }
      throw new Error("Authorization timed out");
    } catch (error) { setMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Connection failed"); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    if (!window.studio) return; setConnection(await window.studio.disconnectYouTube()); setMessage("YouTube disconnected locally.");
  }

  async function syncChannelData() {
    if (!window.studio) return; setDataBusy(true);
    try {
      const result = await window.studio.syncYouTubeChannelData();
      if (!result.ok) { setMessage(result.sanitizedError ?? "Sync failed."); return; }
      setChannelData(await window.studio.getYouTubeChannelData());
      setMessage(`Synced: ${result.videosFetched} videos from ${result.pagesFetched} page(s).`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Sync failed"); }
    finally { setDataBusy(false); }
  }

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <div className="integration-heading"><PlatformIcon name="YouTube" /><div><h3>YouTube</h3><p className="settings-card-subtitle">OAuth 2.0 · publishing, channel data and analytics</p></div></div>
        <span className={`connection-status ${connection?.connected ? "connected" : ""}`}><span className="dot" />{connection?.connected ? connection.channelTitle : "NOT CONNECTED"}</span>
      </div>
      <details className="integration-diagnostics"><summary>Connection details</summary><div className="callback-display"><small>REDIRECT URI</small><code>{connection?.callbackUrl ?? "http://127.0.0.1:43822/callback"}</code></div></details>
      <div className="credential-fields-grid-2">
        <label>Client ID<input placeholder={connection?.configured ? "Already configured" : "Paste Client ID"} value={clientId} onChange={(e) => setClientId(e.target.value)} /></label>
        <label>Client Secret<input type="password" autoComplete="new-password" placeholder={connection?.configured ? "Replace only when needed" : "Paste Client Secret"} value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} /></label>
      </div>
      <div className="settings-row">
        <button disabled={busy || !clientId.trim() || !clientSecret.trim()} onClick={() => void saveCredentials()}>Save credentials</button>
        <button className="primary" disabled={busy || !connection?.configured || connection.connected} onClick={() => void connect()}>{busy ? "Working..." : "Connect YouTube"}</button>
        {connection?.connected && <button className="danger-button" disabled={busy} onClick={() => void disconnect()}>Disconnect</button>}
      </div>
      {connection?.connected && <div className="connected-info connected-info-youtube"><span style={{ color: "#ff0000" }}>✓</span><div><strong>{connection.channelTitle}</strong><small>{connection.channelId}</small></div></div>}
      {connection?.connected && channelData?.channelId === connection.channelId && channelData.channel && (
        <div className="settings-info-panel">
          <div className="settings-row-between">
            <div><strong>{channelData.channel.title}</strong><small className="settings-card-subtitle">Subscribers: {channelData.channel.hiddenSubscriberCount ? "Hidden" : channelData.channel.subscriberCount?.toLocaleString() ?? "—"} · Videos: {channelData.channel.videoCount?.toLocaleString() ?? "—"}</small></div>
            <button disabled={dataBusy} onClick={() => void syncChannelData()}>{dataBusy ? "Syncing..." : "Sync channel data"}</button>
          </div>
        </div>
      )}
      {message && <p className="settings-message">{message}</p>}
    </div>
  );
}

function TikTokConnectionSection() {
  const [connection, setConnection] = useState<TikTokConnection | null>(null);
  const [clientKey, setClientKey] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [profile, setProfile] = useState<TikTokUserProfile | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!window.studio) return;
    void window.studio.getTikTokConnection().then((current) => {
      setConnection(current);
      if (current.connected) void loadProfile();
    }).catch((error) => {
      console.error("[tiktok] Could not load connection status", error);
      setMessage(error instanceof Error ? error.message : "Could not load TikTok connection status");
    });
  }, []);

  async function loadProfile() {
    if (!window.studio) return;
    try {
      const nextProfile = await window.studio.getTikTokUserProfile();
      setProfile(nextProfile);
      setConnection((current) => current ? { ...current, openId: nextProfile.openId, displayName: nextProfile.displayName } : current);
      setMessage("TikTok profile loaded.");
    } catch (error) {
      console.error("[tiktok] User Info request failed", error);
      setMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not load TikTok profile");
    }
  }

  async function saveCredentials() {
    if (!window.studio) return; setBusy(true);
    try { const saved = await window.studio.saveTikTokCredentials(clientKey, clientSecret); setConnection(saved); setClientSecret(""); setMessage("TikTok credentials saved."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save"); }
    finally { setBusy(false); }
  }

  async function connect() {
    console.info("[tiktok] Connect TikTok clicked");
    if (!window.studio) { setMessage("Desktop integration bridge is unavailable. Restart the application."); return; }
    setBusy(true); setMessage("Authorize in the browser...");
    try {
      await window.studio.beginTikTokConnect();
      for (let i = 0; i < 180; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const c = await window.studio.getTikTokConnection(); setConnection(c);
        if (c.connected) { setMessage("TikTok connected. Loading profile..."); await loadProfile(); return; }
        if (c.error) throw new Error(c.error);
      }
      throw new Error("Authorization timed out");
    } catch (error) { setMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Connection failed"); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    if (!window.studio) return; setConnection(await window.studio.disconnectTikTok()); setMessage("TikTok disconnected locally."); setProfile(null);
  }

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <div className="integration-heading"><PlatformIcon name="TikTok" /><div><h3>TikTok</h3><p className="settings-card-subtitle">Content Posting API · private draft upload only</p></div></div>
        <span className={`connection-status ${connection?.connected ? "connected" : ""}`}><span className="dot" />{connection?.connected ? (connection.displayName ?? connection.openId) : "NOT CONNECTED"}</span>
      </div>
      <details className="integration-diagnostics"><summary>Connection details</summary><div className="callback-display"><small>REDIRECT URI</small><code>{connection?.callbackUrl ?? "http://127.0.0.1:43823/callback"}</code></div></details>
      <div className="credential-fields-grid-2">
        <label>Client Key<input placeholder={connection?.configured ? "Already configured" : "Paste Client Key"} value={clientKey} onChange={(e) => setClientKey(e.target.value)} /></label>
        <label>Client Secret<input type="password" autoComplete="new-password" placeholder={connection?.configured ? "Replace only when needed" : "Paste Client Secret"} value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} /></label>
      </div>
      <div className="settings-row">
        <button disabled={busy || !clientKey.trim() || !clientSecret.trim()} onClick={() => void saveCredentials()}>Save credentials</button>
        <button className="primary" disabled={busy || !connection?.configured || connection.connected} onClick={() => void connect()}>{busy ? "Working..." : "Connect TikTok"}</button>
        {connection?.connected && <button className="danger-button" disabled={busy} onClick={() => void disconnect()}>Disconnect</button>}
      </div>
      {connection?.connected && <div className="connected-info connected-info-tiktok">{profile?.avatarUrl ? <img className="tiktok-profile-avatar" src={profile.avatarUrl} alt="TikTok profile" /> : <span>✓</span>}<div><strong>{profile?.displayName ?? connection.displayName ?? "TikTok account"}</strong><small>open_id: {profile?.openId ?? connection.openId}</small></div></div>}
      {connection?.connected && (
        <div className="settings-row">
          <button disabled={busy} onClick={() => void loadProfile()}>Get profile info</button>
          <span className="settings-hint-small">Direct public posting is unavailable until TikTok grants the required publishing approval.</span>
        </div>
      )}
      {message && <p className="settings-message">{message}</p>}
    </div>
  );
}

function AiMediaSection() {
  const [openAiKey, setOpenAiKey] = useState("");
  const [klingStatus, setKlingStatus] = useState<KlingCliStatus | null>(null);
  const [comfyUrl, setComfyUrl] = useState("http://127.0.0.1:8188");
  const [comfyCheckpoint, setComfyCheckpoint] = useState("");
  const [mediaSettings, setMediaSettings] = useState<MediaGenerationSettings>({ openAiConfigured: false, klingConfigured: false, klingCliConfigured: false, klingCliVersion: null, comfyUiUrl: "http://127.0.0.1:8188", comfyUiAvailable: false, comfyUiCheckpoints: [], comfyUiCheckpoint: null, comfyUiError: null });
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!window.studio) return;
    void Promise.all([window.studio.getMediaGenerationSettings(), window.studio.getKlingCliStatus()]).then(([ms, kl]) => {
      setMediaSettings(ms); setComfyUrl(ms.comfyUiUrl); setComfyCheckpoint(ms.comfyUiCheckpoint ?? ""); setKlingStatus(kl);
    }).catch(() => undefined);
  }, []);

  async function saveOpenAiKey() {
    if (!window.studio) return; setMessage("Saving...");
    try { setMediaSettings(await window.studio.saveMediaGenerationCredentials(openAiKey, "")); setOpenAiKey(""); setMessage("OpenAI key saved."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save"); }
  }

  async function testComfyUi() {
    if (!window.studio) return; setMessage("Connecting to ComfyUI...");
    try { const s = await window.studio.testComfyUi(comfyUrl); setMediaSettings(s); setComfyUrl(s.comfyUiUrl); setComfyCheckpoint(s.comfyUiCheckpoint ?? ""); setMessage(`ComfyUI connected. ${s.comfyUiCheckpoints.length} checkpoint(s).`); }
    catch (error) { setMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Connection failed"); }
  }

  async function saveComfyUi() {
    if (!window.studio || !comfyCheckpoint) return; setMessage("Saving...");
    try { const s = await window.studio.saveComfyUiSettings(comfyUrl, comfyCheckpoint); setMediaSettings(s); setMessage(`ComfyUI ready with ${s.comfyUiCheckpoint}.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save"); }
  }

  async function refreshKling() {
    if (!window.studio) return;
    setKlingStatus(await window.studio.getKlingCliStatus());
  }

  return (
    <>
      <header><h1>AI & Media</h1><p>API keys and media generation providers.</p></header>
      <div className="settings-section">
        <h2>OpenAI</h2>
        <div className="provider-section">
          <h3>OpenAI API</h3>
          <p>Image generation with GPT Image. API key encrypted locally.</p>
          <div className="credential-fields settings-field-narrow">
            <label>API Key<input type="password" autoComplete="new-password" placeholder={mediaSettings.openAiConfigured ? "Key configured" : "Paste OpenAI API key"} value={openAiKey} onChange={(e) => setOpenAiKey(e.target.value)} /></label>
          </div>
          <div className="settings-row">
            <button disabled={!openAiKey.trim()} onClick={() => void saveOpenAiKey()}>Save encrypted key</button>
            <span className="settings-hint-small">Can consume paid provider credits.</span>
          </div>
        </div>
      </div>
      <div className="settings-section">
        <h2>Kling CLI (local)</h2>
        <div className="provider-section">
          <h3>Kling CLI</h3>
          <p>Local video generation. No API credits required.</p>
          {klingStatus?.available
            ? <p className="settings-status-ok">Available · kling-cli {klingStatus.version} · {klingStatus.account?.membershipType ?? "unknown"} · {klingStatus.account?.availableRemainCredits ?? 0} credits</p>
            : <p className="settings-status-error">Not available: {klingStatus?.error ?? "Not found"}. Check that Kling is on your PATH, then refresh status</p>}
          <div className="settings-row"><button onClick={() => void refreshKling()}>Refresh status</button></div>
        </div>
      </div>
      <div className="settings-section">
        <h2>ComfyUI</h2>
        <div className="provider-section">
          <h3>ComfyUI Image Generation</h3>
          <p>Local image generation. Starts on demand.</p>
          <div className="settings-row settings-row-tight">
            <label className="settings-label">Address
              <input className="settings-input-medium" value={comfyUrl} onChange={(e) => setComfyUrl(e.target.value)} />
            </label>
            <button onClick={() => void testComfyUi()}>Test & discover models</button>
          </div>
          {mediaSettings.comfyUiCheckpoints.length > 0 && (
            <div className="settings-row settings-row-tight">
              <label className="settings-label">Checkpoint
                <select className="settings-select-inline" value={comfyCheckpoint} onChange={(e) => setComfyCheckpoint(e.target.value)}>
                  <option value="">Select checkpoint</option>
                  {mediaSettings.comfyUiCheckpoints.map((cp) => <option key={cp} value={cp}>{cp}</option>)}
                </select>
              </label>
              <button className="primary" disabled={!comfyCheckpoint} onClick={() => void saveComfyUi()}>Save model</button>
            </div>
          )}
          <div className={mediaSettings.comfyUiAvailable ? "settings-status-ok" : "settings-hint-small"} style={{ marginTop: 8 }}>
            {mediaSettings.comfyUiAvailable ? `● ONLINE · ${mediaSettings.comfyUiCheckpoint ?? "select model"}` : `○ STANDBY · starts on generation`}
          </div>
        </div>
      </div>
      {message && <p className="settings-message">{message}</p>}
    </>
  );
}

function LocalServicesSection() {
  const [services, setServices] = useState<LocalServiceStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!window.studio) return;
    void window.studio.getLocalServiceStatus().then(setServices).catch(() => undefined);
  }, []);

  async function toggleService(service: "ollama" | "comfyui", running: boolean) {
    if (!window.studio) return; setBusy(true); setMessage(`${running ? "Stopping" : "Starting"} ${service}...`);
    try {
      const next = running ? await window.studio.stopLocalService(service) : await window.studio.startLocalService(service);
      setServices(next);
      setMessage(`${service} is ${(service === "ollama" ? next.ollama : next.comfyUi).running ? "running" : "stopped"}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Operation failed"); }
    finally { setBusy(false); }
  }

  async function toggleAutoStart(enabled: boolean) {
    if (!window.studio) return;
    setServices(await window.studio.setLocalServicesAutoStart(enabled));
  }

  async function chooseLauncher() {
    if (!window.studio) return; setBusy(true);
    try { setServices(await window.studio.selectComfyUiLauncher()); }
    finally { setBusy(false); }
  }

  return (
    <>
      <header><h1>Local Services</h1><p>Start, stop and configure local AI service processes.</p></header>
      {services && (
        <div className="settings-section">
          <label className="auto-start-toggle">
            <input type="checkbox" checked={services.autoStart} onChange={(e) => void toggleAutoStart(e.target.checked)} />
            Start Ollama with AI Studio Manager
          </label>
          <div className="settings-grid settings-grid-2">
            <div className="local-service-card">
              <div>
                <strong>Ollama</strong>
                <span className={services.ollama.running ? "online" : ""}>{services.ollama.running ? `● RUNNING${services.ollama.managed ? " · MANAGED" : " · EXTERNAL"}` : "○ STOPPED"}</span>
                {services.ollama.error && <small className="service-error">{services.ollama.error}</small>}
              </div>
              <button className={services.ollama.running ? "danger-button" : "primary"} disabled={busy || (services.ollama.running && !services.ollama.managed)} onClick={() => void toggleService("ollama", services.ollama.running)}>
                {services.ollama.running ? (services.ollama.managed ? "Stop" : "External") : "Start"}
              </button>
            </div>
            <div className="local-service-card">
              <div>
                <strong>ComfyUI</strong>
                <span className={services.comfyUi.running ? "online" : ""}>{services.comfyUi.running ? `● RUNNING${services.comfyUi.managed ? " · MANAGED" : " · EXTERNAL"}` : "○ STOPPED"}</span>
                <small>{services.comfyUi.batchPath ?? "No .bat launcher selected"}</small>
                {services.comfyUi.error && <small className="service-error">{services.comfyUi.error}</small>}
              </div>
              <div className="settings-row-tight">
                <button disabled={busy} onClick={() => void chooseLauncher()}>Choose .bat</button>
                <button className={services.comfyUi.running ? "danger-button" : "primary"} disabled={busy || (services.comfyUi.running && !services.comfyUi.managed)} onClick={() => void toggleService("comfyui", services.comfyUi.running)}>
                  {services.comfyUi.running ? (services.comfyUi.managed ? "Stop" : "External") : "Start"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {message && <p className="settings-message">{message}</p>}
    </>
  );
}

function InfrastructureSection() {
  const [bridge, setBridge] = useState<MediaBridgeStatus | null>(null);
  const [accountId, setAccountId] = useState("");
  const [bucket, setBucket] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!window.studio) return;
    void window.studio.getMediaBridgeStatus().then((b) => { setBridge(b); setAccountId(b.accountId ?? ""); setBucket(b.bucket ?? ""); }).catch(() => undefined);
  }, []);

  async function save() {
    if (!window.studio) return; setBusy(true); setMessage("Testing R2 connection...");
    try {
      const saved = await window.studio.saveMediaBridgeSettings(accountId, bucket, accessKeyId, secretKey);
      setBridge(saved); setSecretKey(""); setMessage("Media Bridge connected.");
    } catch (error) { setMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not configure"); }
    finally { setBusy(false); }
  }

  return (
    <>
      <header><h1>Infrastructure</h1><p>Cloudflare R2, delivery and technical configuration.</p></header>
      <div className="settings-section">
        <h2>Secure Media Bridge — Cloudflare R2</h2>
        <p className="settings-hint">Private bucket for temporary signed URLs. Objects auto-delete after publishing.</p>
        <div className="settings-card">
          <div className="settings-grid settings-grid-2">
            <div className="infra-field"><label>Account ID</label><input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="Cloudflare Account ID" /></div>
            <div className="infra-field"><label>Bucket</label><input value={bucket} onChange={(e) => setBucket(e.target.value)} placeholder="Private R2 bucket name" /></div>
            <div className="infra-field"><label>Access Key ID</label><input value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} placeholder={bridge?.configured ? "Replace only when needed" : "R2 Access Key ID"} /></div>
            <div className="infra-field"><label>Secret Access Key</label><input type="password" autoComplete="new-password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder={bridge?.configured ? "Replace only when needed" : "R2 Secret Access Key"} /></div>
          </div>
          <div className="settings-row">
            <button className="primary" disabled={busy || !accountId.trim() || !bucket.trim() || !accessKeyId.trim() || !secretKey.trim()} onClick={() => void save()}>{busy ? "Testing..." : "Save & test bridge"}</button>
            <span className={`connection-status ${bridge?.configured ? "connected" : ""}`}><span className="dot" />{bridge?.configured ? `READY · ${bridge.bucket}` : "NOT CONFIGURED"}</span>
          </div>
          {message && <p className="settings-message">{message}</p>}
        </div>
      </div>
    </>
  );
}

export default SettingsPage;
