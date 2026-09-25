import { useEffect, useState } from "react";
import type { MetaConnection, PublishingQueueItem, YouTubeConnection, TikTokConnection } from "../../../electron/shared/contracts";
import { Tabs } from "../../ui/Tabs";
import { Button } from "../../ui/Button";
import { PageHeader } from "../../ui/PageHeader";
import { SectionCard } from "../../ui/SectionCard";
import { Select } from "../../ui/Select";
import { StatusBadge } from "../../ui/StatusBadge";
import { Textarea } from "../../ui/Textarea";
import { Toolbar } from "../../ui/Toolbar";
import { PlatformIcon } from "../dashboard/PlatformIcon";
import "./publishing.css";

type PublishingTab = "compose" | "queue" | "history";

interface PublishingPageProps {
  onNavigate: (view: string) => void;
}

export function PublishingPage({ onNavigate }: PublishingPageProps) {
  const [activeTab, setActiveTab] = useState<PublishingTab>("queue");
  return (
    <div className="publishing-page v4-page">
      <PageHeader eyebrow="Publishing" title="Publishing workspace" lead="Compose one-off posts, review the scheduled queue and inspect delivery history." />
      <Tabs tabs={[{ id: "compose", label: "Compose" }, { id: "queue", label: "Queue" }, { id: "history", label: "History" }]} activeTab={activeTab} onChange={(id) => setActiveTab(id as PublishingTab)} ariaLabel="Publishing sections" />
      {activeTab === "compose" && <ComposeSection />}
      {activeTab === "queue" && <QueueSection onNavigate={onNavigate} />}
      {activeTab === "history" && <HistorySection />}
    </div>
  );
}

function ComposeSection() {
  const [meta, setMeta] = useState<MetaConnection | null>(null);
  const [youTube, setYouTube] = useState<YouTubeConnection | null>(null);
  const [tikTok, setTikTok] = useState<TikTokConnection | null>(null);
  const [platform, setPlatform] = useState<"Facebook" | "Instagram" | "YouTube" | "TikTok">("Facebook");
  const [destinationId, setDestinationId] = useState("");
  const [caption, setCaption] = useState("");
  const [videoPath, setVideoPath] = useState("");
  const [privacy, setPrivacy] = useState("private");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!window.studio) return;
    void Promise.all([window.studio.getMetaConnection(), window.studio.getYouTubeConnection(), window.studio.getTikTokConnection()]).then(([m, y, t]) => { setMeta(m); setYouTube(y); setTikTok(t); }).catch(() => undefined);
  }, []);

  const connectedPlatforms = [
    meta?.connected ? "Facebook" as const : null,
    meta?.connected ? "Instagram" as const : null,
    youTube?.connected ? "YouTube" as const : null,
    tikTok?.connected ? "TikTok" as const : null,
  ].filter(Boolean);

  useEffect(() => {
    if (!connectedPlatforms.includes(platform)) {
      setPlatform(connectedPlatforms[0] ?? "Facebook");
    }
  }, [connectedPlatforms.join(",")]);

  async function publish() {
    if (!window.studio) return;
    setBusy(true); setMessage("Publishing..."); setResult(null);
    try {
      if ((platform === "Facebook" || platform === "Instagram") && meta) {
        const destId = destinationId || meta.destinations.find((d) => d.platform === platform)?.id;
        if (!destId) { setMessage("No destination available."); setBusy(false); return; }
        const res = await window.studio.publishMetaTestPost({ destinationId: destId, text: caption });
        setResult(res.ok ? `Published · Post ${res.postId}` : res.error ?? "Failed");
        setMessage(res.ok ? "Published successfully." : "Publishing failed.");
      } else if (platform === "YouTube" && youTube) {
        if (!videoPath) { setMessage("Select a video file first."); setBusy(false); return; }
        const tags = caption.split(",").map((t) => t.trim()).filter(Boolean);
        const res = await window.studio.publishYouTubeTest({ title: caption.slice(0, 100) || "Untitled", description: caption, tags, privacyStatus: privacy as "private" | "unlisted" | "public", videoPath, thumbnailPath: null });
        setResult(res.ok ? `Uploaded · ${res.videoId}` : res.sanitizedError ?? "Failed");
        setMessage(res.ok ? "YouTube upload complete." : "Upload failed.");
      } else if (platform === "TikTok" && tikTok) {
        if (!videoPath) { setMessage("Select a video file first."); setBusy(false); return; }
        const res = await window.studio.publishTikTokTest({ mode: "draft", caption, videoPath, privacyLevel: "SELF_ONLY" });
        setResult(res.ok ? `Draft · ${res.publishId}` : res.sanitizedError ?? "Failed");
        setMessage(res.ok ? "TikTok draft uploaded." : "Upload failed.");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Publishing failed"); }
    finally { setBusy(false); }
  }

  async function selectVideo() {
    if (!window.studio) return;
    if (platform === "YouTube") { const p = await window.studio.selectYouTubeTestVideo(); if (p) setVideoPath(p); }
    else if (platform === "TikTok") { const p = await window.studio.selectTikTokTestVideo(); if (p) setVideoPath(p); }
  }

  return (
    <div className="publishing-compose">
      <SectionCard eyebrow="Delivery" title="Compose post" className="compose-form">
          <Select label="Platform" value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)}>
            {connectedPlatforms.length === 0 && <option value="">No platforms connected</option>}
            {meta?.connected && <><option value="Facebook">Facebook</option><option value="Instagram">Instagram</option></>}
            {youTube?.connected && <option value="YouTube">YouTube</option>}
            {tikTok?.connected && <option value="TikTok">TikTok</option>}
          </Select>
        {(platform === "Facebook" || platform === "Instagram") && meta?.connected && (
          <Select label="Destination" value={destinationId} onChange={(e) => setDestinationId(e.target.value)}>
              <option value="">Select destination</option>
              {meta.destinations.filter((d) => d.platform === platform).map((d) => (
                <option key={d.id} value={d.id}>{d.username ? `@${d.username}` : d.name}</option>
              ))}
          </Select>
        )}
        {platform === "YouTube" && (
          <Select label="Publishing mode" value={privacy} helperText="YouTube visibility is applied at upload time." onChange={(e) => setPrivacy(e.target.value)}>
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
          </Select>
        )}
        <Textarea label={platform === "YouTube" ? "Title / Description" : "Caption"} rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={platform === "YouTube" ? "Video title and description" : "Write your post caption..."} />
        {(platform === "YouTube" || platform === "TikTok") && (
          <div className="compose-field">
            <label>Video asset</label>
            <Toolbar>
              <Button variant="secondary" onClick={() => void selectVideo()}>Select video</Button>
              <small className="compose-video-path">{videoPath || "No file selected"}</small>
            </Toolbar>
          </div>
        )}
        <Toolbar><Button disabled={busy || !caption.trim() || connectedPlatforms.length === 0} onClick={() => void publish()}>{busy ? "Publishing..." : "Publish now"}</Button></Toolbar>
        {message && <p className={`settings-message ${result && result.includes("Failed") ? "error" : ""}`}>{message}</p>}
      </SectionCard>
      <SectionCard eyebrow="Preview" title="Delivery preview" className="compose-preview" meta={<StatusBadge label={connectedPlatforms.includes(platform) ? "AVAILABLE" : "NOT CONNECTED"} tone={connectedPlatforms.includes(platform) ? "success" : "warning"} />}>
        <div className="preview-card">
          <div className="preview-platform"><PlatformIcon name={platform} /><strong>{platform}</strong></div>
          <p>{caption || "Your caption will appear here..."}</p>
          {videoPath && <small className="preview-video-badge">Video: {videoPath.split(/[/\\]/).pop()}</small>}
        </div>
        <p className="publishing-capability-note">{platform === "TikTok" ? "TikTok currently uploads a private draft for review in TikTok." : platform === "YouTube" ? "Video upload uses the selected YouTube privacy mode." : "Publishing uses the selected connected Meta destination."}</p>
      </SectionCard>
    </div>
  );
}

function QueueSection({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [queue, setQueue] = useState<PublishingQueueItem[]>([]);
  const [message, setMessage] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [meta, setMeta] = useState<MetaConnection | null>(null);
  const [metaDest, setMetaDest] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!window.studio) return;
    void Promise.all([window.studio.listPublishingQueue(), window.studio.getMetaConnection()]).then(([q, m]) => { setQueue(q); setMeta(m); }).catch(() => undefined);
  }, []);

  async function review(id: string, action: "APPROVE" | "REJECT" | "SCHEDULE") {
    if (!window.studio) return;
    try {
      const updated = await window.studio.reviewPublishingQueueItem({ id, action, reason: reviewReason.trim() || undefined });
      setQueue((current) => current.map((item) => item.id === id ? updated : item));
      setReviewReason("");
      setMessage(`Item ${action.toLowerCase()}d.`);
    } catch (error) { setMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not review"); }
  }

  async function publishMeta(id: string) {
    if (!window.studio) return;
    const destId = metaDest[id];
    if (!destId) { setMessage("Select a Meta destination first."); return; }
    try {
      const updated = await window.studio.publishMetaQueueItem(id, destId);
      setQueue((current) => current.map((item) => item.id === id ? updated : item));
      setMessage(`Published · Meta post ${updated.remotePostId}`);
    } catch (error) { setMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Meta publishing failed"); }
  }

  const scheduled = queue.filter((item) => ["scheduled", "approved", "failed"].includes(item.status));
  const publishing = queue.filter((item) => item.status === "publishing");

  return (
    <div>
      <div className="queue-stats" aria-label="Queue summary">
        <span><strong>{publishing.length}</strong> publishing</span>
        <span><strong>{scheduled.length}</strong> scheduled/approved</span>
        <span><strong>{queue.filter((i) => i.status === "published").length}</strong> published</span>
      </div>
      {message && <p className="settings-message">{message}</p>}
      {scheduled.length === 0 ? (
        <div className="queue-empty"><strong>Queue is empty</strong><p>Approved promo content from Content Calendar appears here.</p><Button variant="secondary" onClick={() => onNavigate("calendar")}>Open Calendar</Button></div>
      ) : (
        <div className="queue-list">
          {scheduled.map((item) => (
            <article className="queue-item" key={item.id}>
              <div className="queue-date">
                <b>{item.scheduledAt ? new Date(item.scheduledAt).toLocaleDateString(undefined, { day: "2-digit", month: "short" }) : "NO DATE"}</b>
                <span>{item.scheduledAt ? new Date(item.scheduledAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "Draft"}</span>
              </div>
              <div className="queue-content">
                <div className="queue-title"><PlatformIcon name={item.platform} /><strong>{item.platform} · {item.releaseTitle}</strong></div>
                <p>{item.caption}</p>
              </div>
              <StatusBadge className="queue-status" label={item.status.toUpperCase()} tone={item.status === "failed" ? "danger" : item.status === "published" ? "success" : item.status === "publishing" ? "warning" : "cyan"} />
              <div className="queue-actions">
                {item.status === "approved" && (item.platform === "Facebook" || item.platform === "Instagram") && meta?.connected && (
                  <>
                    <select className="queue-dest-select" value={metaDest[item.id] ?? ""} onChange={(e) => setMetaDest((c) => ({ ...c, [item.id]: e.target.value }))}>
                      <option value="">Destination</option>
                      {meta.destinations.filter((d) => d.platform === item.platform).map((d) => <option key={d.id} value={d.id}>{d.username ?? d.name}</option>)}
                    </select>
                    <Button onClick={() => void publishMeta(item.id)}>Publish</Button>
                  </>
                )}
                <Button variant="secondary" onClick={() => void review(item.id, "SCHEDULE")}>Schedule</Button>
                <Button variant="ghost" onClick={() => void review(item.id, "REJECT")} className="danger-button">Reject</Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function HistorySection() {
  const [queue, setQueue] = useState<PublishingQueueItem[]>([]);

  useEffect(() => {
    if (!window.studio) return;
    void window.studio.listPublishingQueue().then(setQueue).catch(() => undefined);
  }, []);

  const published = queue.filter((item) => item.status === "published");
  const failed = queue.filter((item) => item.status === "failed");

  return (
    <div>
      <span className="eyebrow">Published items</span>
      {published.length === 0 && failed.length === 0 ? (
        <div className="queue-empty"><strong>No publishing history</strong><p>Published and failed items appear here.</p></div>
      ) : (
        <div className="history-list">
          {[...published, ...failed].sort((a, b) => {
            const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
            const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
            return bTime - aTime;
          }).map((item) => (
            <article className="history-item" key={item.id}>
              <b className={item.status}>{item.status}</b>
              <div>
                <strong>{item.platform} · {item.releaseTitle}</strong>
                <small>{item.publishedAt ? new Date(item.publishedAt).toLocaleString() : "—"}{item.remotePostId ? ` · Post ${item.remotePostId}` : ""}</small>
              </div>
              <small className="history-media-type">{item.mediaType ? `${item.mediaProvider} ${item.mediaType}` : "Text"}</small>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default PublishingPage;
