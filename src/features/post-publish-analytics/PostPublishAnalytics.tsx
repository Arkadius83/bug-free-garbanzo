import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { CampaignChannel, PostPublishSnapshot, PublishingQueueItem, ReleaseAnalyticsSummary } from "../../../electron/shared/contracts";
import "./post-publish-analytics.css";

type FilterPlatform = CampaignChannel | "All";

interface BatchProgress {
  total: number;
  processed: number;
  refreshed: number;
  failed: number;
  skipped: number;
  running: boolean;
}

interface PostPublishAnalyticsProps {
  publishingQueue: PublishingQueueItem[];
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function metric(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString();
}

export function PostPublishAnalytics({ publishingQueue }: PostPublishAnalyticsProps) {
  const [snapshots, setSnapshots] = useState<PostPublishSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [platformFilter, setPlatformFilter] = useState<FilterPlatform>("All");
  const [releaseFilter, setReleaseFilter] = useState<string>("All");
  const [batchProgress, setBatchProgress] = useState<BatchProgress>({ total: 0, processed: 0, refreshed: 0, failed: 0, skipped: 0, running: false });

  const [compareMode, setCompareMode] = useState(false);
  const [selectedReleases, setSelectedReleases] = useState<Set<string>>(new Set());
  const [comparisonData, setComparisonData] = useState<Map<string, ReleaseAnalyticsSummary>>(new Map());
  const [compareLoading, setCompareLoading] = useState(false);

  const publishedItems = useMemo(
    () => publishingQueue.filter((item) => item.status === "published" && item.remotePostId),
    [publishingQueue]
  );

  const releases = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of publishedItems) map.set(item.releaseId, item.releaseTitle);
    return Array.from(map.entries());
  }, [publishedItems]);

  const filteredItems = useMemo(() => {
    return publishedItems.filter((item) => {
      if (platformFilter !== "All" && item.platform !== platformFilter) return false;
      if (releaseFilter !== "All" && item.releaseId !== releaseFilter) return false;
      return true;
    });
  }, [publishedItems, platformFilter, releaseFilter]);

  const eligibleItems = useMemo(() => {
    return filteredItems.filter((item) => ["Instagram", "Facebook"].includes(item.platform) && item.remotePostId);
  }, [filteredItems]);

  async function loadSnapshots(itemId: string) {
    if (!window.studio || !itemId) return;
    setLoading(true);
    setMessage("");
    try {
      const data = await window.studio.getAnalyticsSnapshots(itemId);
      setSnapshots(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load snapshots");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedItemId) void loadSnapshots(selectedItemId);
  }, [selectedItemId]);

  function handleVerify(itemId: string) {
    if (!window.studio) return;
    setLoading(true);
    setMessage("");
    window.studio.verifyPublishedPost(itemId).then((snapshot) => {
      setSnapshots((prev) => [snapshot, ...prev]);
      setMessage("Verification complete.");
    }).catch((error) => {
      setMessage(error instanceof Error ? error.message : "Verification failed");
    }).finally(() => setLoading(false));
  }

  function handleFetchAnalytics(itemId: string) {
    if (!window.studio) return;
    setLoading(true);
    setMessage("");
    window.studio.fetchAndStorePostAnalytics(itemId).then((snapshot) => {
      setSnapshots((prev) => [snapshot, ...prev]);
      setMessage("Analytics fetched and stored.");
    }).catch((error) => {
      setMessage(error instanceof Error ? error.message : "Could not fetch analytics");
    }).finally(() => setLoading(false));
  }

  async function handleBatchRefresh() {
    if (!window.studio || batchProgress.running) return;
    const items = eligibleItems;
    if (items.length === 0) return;

    const initial: BatchProgress = { total: items.length, processed: 0, refreshed: 0, failed: 0, skipped: 0, running: true };
    setBatchProgress(initial);
    setMessage("");

    let refreshed = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        await window.studio.fetchAndStorePostAnalytics(item.id);
        refreshed++;
      } catch {
        failed++;
      }
      setBatchProgress((prev) => ({ ...prev, processed: i + 1, refreshed, failed, skipped }));
    }

    setBatchProgress((prev) => ({ ...prev, running: false }));
    setMessage(`Batch refresh complete: ${refreshed} refreshed, ${failed} failed, ${skipped} skipped out of ${items.length}.`);
  }

  const toggleReleaseSelection = useCallback((releaseId: string) => {
    setSelectedReleases((prev) => {
      const next = new Set(prev);
      if (next.has(releaseId)) next.delete(releaseId);
      else next.add(releaseId);
      return next;
    });
  }, []);

  const loadComparison = useCallback(async () => {
    if (!window.studio || selectedReleases.size < 2) return;
    setCompareLoading(true);
    const next = new Map<string, ReleaseAnalyticsSummary>();
    for (const releaseId of selectedReleases) {
      try {
        const summary = await window.studio.getReleaseAnalyticsSummary(releaseId);
        next.set(releaseId, summary);
      } catch {
        // skip failed loads
      }
    }
    setComparisonData(next);
    setCompareLoading(false);
  }, [selectedReleases]);

  useEffect(() => {
    if (compareMode && selectedReleases.size >= 2) void loadComparison();
  }, [compareMode, selectedReleases, loadComparison]);

  const latestSnapshot = snapshots[0] ?? null;
  const batchRunning = batchProgress.running;

  const allPlatforms: CampaignChannel[] = ["Instagram", "Facebook"];

  return (
    <div className="ppa-page">
      <header className="ppa-header">
        <div>
          <span className="eyebrow">Post-Publish Analytics</span>
          <h1>Published post performance.</h1>
          <p>Verify published posts and track engagement metrics from Meta Graph API.</p>
        </div>
        <div className="ppa-filters">
          <label>
            Platform
            <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value as FilterPlatform)}>
              <option value="All">All platforms</option>
              <option value="Instagram">Instagram</option>
              <option value="Facebook">Facebook</option>
            </select>
          </label>
          <label>
            Release
            <select value={releaseFilter} onChange={(e) => setReleaseFilter(e.target.value)}>
              <option value="All">All releases</option>
              {releases.map(([id, title]) => (
                <option key={id} value={id}>{title}</option>
              ))}
            </select>
          </label>
          <button
            className="primary ppa-refresh-btn"
            disabled={batchRunning || eligibleItems.length === 0}
            onClick={() => void handleBatchRefresh()}
          >
            {batchRunning ? `Refreshing ${batchProgress.processed}/${batchProgress.total}...` : `Refresh All (${eligibleItems.length})`}
          </button>
        </div>
      </header>

      {batchRunning && (
        <div className="ppa-batch-progress">
          <div className="ppa-progress-bar">
            <i style={{ width: `${(batchProgress.processed / batchProgress.total) * 100}%` }} />
          </div>
          <div className="ppa-progress-stats">
            <span>Processed: {batchProgress.processed} / {batchProgress.total}</span>
            <span className="ppa-stat-ok">Refreshed: {batchProgress.refreshed}</span>
            <span className="ppa-stat-fail">Failed: {batchProgress.failed}</span>
          </div>
        </div>
      )}

      {message && <p className="ppa-message">{message}</p>}

      {filteredItems.length === 0 ? (
        <div className="ppa-empty">
          <p>No published posts match the current filters.</p>
          <small>Publish a post from the Content Calendar to see analytics here.</small>
        </div>
      ) : (
        <div className="ppa-layout">
          <section className="ppa-post-list panel">
            <h3>Published Posts ({filteredItems.length})</h3>
            <div className="ppa-list">
              {filteredItems.map((item) => (
                <article
                  key={item.id}
                  className={`ppa-post-card ${selectedItemId === item.id ? "selected" : ""}`}
                  onClick={() => setSelectedItemId(item.id)}
                >
                  <div className="ppa-post-header">
                    <strong>{item.platform}</strong>
                    <span className="ppa-post-title">{item.sourceCampaignItemTitle ?? item.releaseTitle}</span>
                  </div>
                  <div className="ppa-post-meta">
                    <span>{item.releaseTitle}</span>
                    <span>{formatDateTime(item.publishedAt)}</span>
                  </div>
                  <div className="ppa-post-id">
                    <small>ID: {item.remotePostId}</small>
                  </div>
                  <div className="ppa-post-actions">
                    <button onClick={(e) => { e.stopPropagation(); handleVerify(item.id); }} disabled={loading || batchRunning}>Verify</button>
                    <button onClick={(e) => { e.stopPropagation(); handleFetchAnalytics(item.id); }} disabled={loading || batchRunning}>Fetch Metrics</button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="ppa-detail panel">
            {selectedItemId ? (
              loading && !latestSnapshot ? (
                <p className="ppa-loading">Loading...</p>
              ) : latestSnapshot ? (
                <>
                  <h3>Latest Snapshot</h3>
                  <div className="ppa-verification">
                    <span className={`ppa-status ${latestSnapshot.verified ? "verified" : "failed"}`}>
                      {latestSnapshot.verified ? "Verified" : "Not Verified"}
                    </span>
                    {latestSnapshot.verificationError && (
                      <small className="ppa-error">{latestSnapshot.verificationError}</small>
                    )}
                    <small>Captured: {formatDateTime(latestSnapshot.capturedAt)}</small>
                  </div>
                  <div className="ppa-metrics-grid">
                    <div className="ppa-metric-card">
                      <span className="ppa-metric-label">Views</span>
                      <span className="ppa-metric-value">{metric(latestSnapshot.views)}</span>
                    </div>
                    <div className="ppa-metric-card">
                      <span className="ppa-metric-label">Reach</span>
                      <span className="ppa-metric-value">{metric(latestSnapshot.reach)}</span>
                    </div>
                    <div className="ppa-metric-card">
                      <span className="ppa-metric-label">Impressions</span>
                      <span className="ppa-metric-value">{metric(latestSnapshot.impressions)}</span>
                    </div>
                    <div className="ppa-metric-card">
                      <span className="ppa-metric-label">Likes</span>
                      <span className="ppa-metric-value">{metric(latestSnapshot.likes)}</span>
                    </div>
                    <div className="ppa-metric-card">
                      <span className="ppa-metric-label">Comments</span>
                      <span className="ppa-metric-value">{metric(latestSnapshot.comments)}</span>
                    </div>
                    <div className="ppa-metric-card">
                      <span className="ppa-metric-label">Shares</span>
                      <span className="ppa-metric-value">{metric(latestSnapshot.shares)}</span>
                    </div>
                    <div className="ppa-metric-card">
                      <span className="ppa-metric-label">Clicks</span>
                      <span className="ppa-metric-value">{metric(latestSnapshot.clicks)}</span>
                    </div>
                  </div>

                  {snapshots.length > 1 && (
                    <>
                      <h3>Snapshot History ({snapshots.length})</h3>
                      <div className="ppa-history">
                        <table>
                          <thead>
                            <tr>
                              <th>Captured</th>
                              <th>Verified</th>
                              <th>Views</th>
                              <th>Reach</th>
                              <th>Likes</th>
                              <th>Comments</th>
                              <th>Shares</th>
                            </tr>
                          </thead>
                          <tbody>
                            {snapshots.map((snap) => (
                              <tr key={snap.id}>
                                <td>{formatDateTime(snap.capturedAt)}</td>
                                <td><span className={`ppa-status-mini ${snap.verified ? "verified" : "failed"}`}>{snap.verified ? "Yes" : "No"}</span></td>
                                <td>{metric(snap.views)}</td>
                                <td>{metric(snap.reach)}</td>
                                <td>{metric(snap.likes)}</td>
                                <td>{metric(snap.comments)}</td>
                                <td>{metric(snap.shares)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="ppa-empty-detail">
                  <p>No snapshots yet for this post.</p>
                  <small>Click "Verify" or "Fetch Metrics" to collect data.</small>
                </div>
              )
            ) : (
              <div className="ppa-empty-detail">
                <p>Select a published post to view analytics.</p>
              </div>
            )}
          </section>
        </div>
      )}

      <section className="ppa-compare panel">
        <div className="ppa-compare-header">
          <div>
            <h3>Compare Releases</h3>
            <p>Select 2 or more releases to compare their post-publish performance side by side.</p>
          </div>
          <button
            className={`ppa-compare-toggle ${compareMode ? "active" : ""}`}
            onClick={() => setCompareMode((prev) => !prev)}
          >
            {compareMode ? "Close Comparison" : "Compare Releases"}
          </button>
        </div>

        {compareMode && (
          <>
            <div className="ppa-compare-selector">
              {releases.map(([id, title]) => (
                <label key={id} className="ppa-compare-check">
                  <input
                    type="checkbox"
                    checked={selectedReleases.has(id)}
                    onChange={() => toggleReleaseSelection(id)}
                  />
                  <span>{title}</span>
                </label>
              ))}
              {releases.length === 0 && <small>No releases with published posts available.</small>}
            </div>

            {selectedReleases.size >= 2 && (
              <div className="ppa-compare-table-wrap">
                {compareLoading ? (
                  <p className="ppa-loading">Loading comparison data...</p>
                ) : comparisonData.size > 0 ? (
                  <table className="ppa-compare-table">
                    <thead>
                      <tr>
                        <th>Release</th>
                        {allPlatforms.map((p) => (
                          <th key={p} colSpan={5}>{p}</th>
                        ))}
                        <th>Latest</th>
                      </tr>
                      <tr>
                        <th></th>
                        {allPlatforms.map((p) => (
                          <React.Fragment key={p}>
                            <th>Posts</th>
                            <th>Avg Reach</th>
                            <th>Avg Likes</th>
                            <th>Avg Comments</th>
                            <th>Avg Shares</th>
                          </React.Fragment>
                        ))}
                        <th>Snapshot</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(comparisonData.values()).map((summary) => (
                        <tr key={summary.releaseId}>
                          <td className="ppa-compare-release-name">
                            {releases.find(([id]) => id === summary.releaseId)?.[1] ?? summary.releaseId}
                          </td>
                          {allPlatforms.map((p) => {
                            const platformData = summary.platforms.find((x) => x.platform === p);
                            return (
                              <React.Fragment key={p}>
                                <td>{platformData ? platformData.postCount : "—"}</td>
                                <td>{platformData ? metric(platformData.avgReach) : "—"}</td>
                                <td>{platformData ? metric(platformData.avgLikes) : "—"}</td>
                                <td>{platformData ? metric(platformData.avgComments) : "—"}</td>
                                <td>{platformData ? metric(platformData.avgShares) : "—"}</td>
                              </React.Fragment>
                            );
                          })}
                          <td>{summary.recentSnapshotAt ? formatDateTime(summary.recentSnapshotAt) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="ppa-compare-empty">No analytics data available for the selected releases.</p>
                )}
              </div>
            )}

            {selectedReleases.size > 0 && selectedReleases.size < 2 && (
              <p className="ppa-compare-hint">Select at least {2 - selectedReleases.size} more release{selectedReleases.size === 0 ? "s" : ""} to compare.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
