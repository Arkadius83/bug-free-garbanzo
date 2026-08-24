import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AssetSummary, AttachAssetInput, AudioAnalysisSummary, CreateReleaseDraftInput, CreateTaskInput, DatabaseHealth, DraftStatus, DraftSummary, ReleaseReadiness, ReleaseSummary, SaveGeneratedDraftInput, SoundCloudPerformancePoint, SoundCloudTrackPerformance, SoundCloudTrackSummary, TaskStatus, TaskSummary, UpdateReleaseInput, UpdateSoundCloudTrackInput } from "../../shared/contracts.js";
import { migrations } from "./migrations.js";

const seedArtists = [
  ["the-arkadiusz", "The Arkadiusz", ["Full-On Psytrance", "Dark Psy", "Progressive Psytrance", "Classic Psytrance"], "Psychedelic, conscious, direct, emotionally grounded"],
  ["arkadelic", "Arkadelic", ["Hi-Tech Psytrance", "Hard Trance"], "Fast, futuristic, playful, intense"],
  ["ar-tek", "AR-TEK", ["Techno", "Psy-Tech"], "Minimal, technological, hypnotic, club-focused"],
  ["echoes-of-arcadia", "Echoes of Arcadia", ["Psybient", "Psychill", "Downtempo", "Ambient"], "Cinematic, spacious, contemplative, organic"]
] as const;

export class StudioDatabase {
  private readonly database: DatabaseSync;

  constructor(private readonly filePath: string) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    this.database = new DatabaseSync(filePath);
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  }

  initialize(): void {
    const currentVersion = Number(this.database.prepare("PRAGMA user_version").get()?.user_version ?? 0);
    const latestVersion = migrations.at(-1)?.version ?? 0;
    if (currentVersion > latestVersion) throw new Error(`Database schema ${currentVersion} is newer than supported ${latestVersion}`);

    for (const migration of migrations.filter((item) => item.version > currentVersion)) {
      this.database.exec("BEGIN IMMEDIATE");
      try {
        this.database.exec(migration.sql);
        this.database.exec(`PRAGMA user_version = ${migration.version}`);
        this.database.exec("COMMIT");
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw new Error(`Migration ${migration.version} (${migration.name}) failed`, { cause: error });
      }
    }
    this.seedArtistProfiles();
  }

  health(): DatabaseHealth {
    const row = this.database.prepare("PRAGMA user_version").get();
    return { ready: true, schemaVersion: Number(row?.user_version ?? 0), path: this.filePath };
  }

  listReleases(): ReleaseSummary[] {
    return this.database.prepare(`
      SELECT r.id, r.title, p.artist_id AS artistId, a.name AS artistName,
             t.primary_genre AS primaryGenre, t.story, r.status, r.release_date AS releaseDate,
             r.created_at AS createdAt
      FROM releases r
      JOIN projects p ON p.id = r.project_id
      JOIN artist_profiles a ON a.id = p.artist_id
      JOIN release_tracks rt ON rt.release_id = r.id AND rt.position = 1
      JOIN tracks t ON t.id = rt.track_id
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT 100
    `).all() as unknown as ReleaseSummary[];
  }

  createReleaseDraft(input: CreateReleaseDraftInput): ReleaseSummary {
    const title = input.title.trim();
    const genre = input.primaryGenre.trim();
    const story = input.story.trim();
    if (!title) throw new Error("Track title is required");
    if (!genre) throw new Error("Primary genre is required");
    const artist = this.database.prepare("SELECT name FROM artist_profiles WHERE id = ?").get(input.artistId) as { name: string } | undefined;
    if (!artist) throw new Error("Unknown artist profile");

    const now = new Date().toISOString();
    const projectId = randomUUID();
    const trackId = randomUUID();
    const releaseId = randomUUID();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("INSERT INTO projects (id, artist_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(projectId, input.artistId, title, now, now);
      this.database.prepare("INSERT INTO tracks (id, project_id, title, primary_genre, story, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(trackId, projectId, title, genre, story, now, now);
      this.database.prepare("INSERT INTO releases (id, project_id, title, release_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(releaseId, projectId, title, input.releaseDate || null, now, now);
      this.database.prepare("INSERT INTO release_tracks (release_id, track_id, position) VALUES (?, ?, 1)").run(releaseId, trackId);
      this.database.prepare("INSERT INTO events (entity_type, entity_id, event_type, payload_json, created_at) VALUES ('release', ?, 'release.created', ?, ?)").run(releaseId, JSON.stringify({ artistId: input.artistId, trackId, projectId }), now);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }

    return { id: releaseId, title, artistId: input.artistId, artistName: artist.name, primaryGenre: genre, story, status: "draft", releaseDate: input.releaseDate || null, createdAt: now };
  }

  updateRelease(input: UpdateReleaseInput): ReleaseSummary {
    const title = input.title.trim(), genre = input.primaryGenre.trim(), story = input.story.trim();
    if (!title) throw new Error("Track title is required");
    if (!genre) throw new Error("Primary genre is required");
    const current = this.database.prepare(`
      SELECT r.status, r.project_id AS projectId, rt.track_id AS trackId
      FROM releases r JOIN release_tracks rt ON rt.release_id = r.id AND rt.position = 1
      WHERE r.id = ?
    `).get(input.id) as { status: UpdateReleaseInput["status"]; projectId: string; trackId: string } | undefined;
    if (!current) throw new Error("Release not found");
    const artist = this.database.prepare("SELECT name FROM artist_profiles WHERE id = ?").get(input.artistId) as { name: string } | undefined;
    if (!artist) throw new Error("Unknown artist profile");
    const transitions: Record<UpdateReleaseInput["status"], UpdateReleaseInput["status"][]> = {
      draft: ["draft", "planned"], planned: ["draft", "planned", "scheduled"],
      scheduled: ["planned", "scheduled", "published"], published: ["published", "archived"], archived: ["draft", "archived"]
    };
    if (!transitions[current.status].includes(input.status)) throw new Error("Invalid release status transition");
    const now = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("UPDATE projects SET artist_id = ?, name = ?, updated_at = ? WHERE id = ?").run(input.artistId, title, now, current.projectId);
      this.database.prepare("UPDATE tracks SET title = ?, primary_genre = ?, story = ?, updated_at = ? WHERE id = ?").run(title, genre, story, now, current.trackId);
      this.database.prepare("UPDATE releases SET title = ?, status = ?, release_date = ?, updated_at = ? WHERE id = ?").run(title, input.status, input.releaseDate || null, now, input.id);
      this.database.prepare("INSERT INTO events (entity_type, entity_id, event_type, payload_json, created_at) VALUES ('release', ?, 'release.updated', ?, ?)").run(input.id, JSON.stringify({ fromStatus: current.status, toStatus: input.status, artistId: input.artistId, title, genre, releaseDate: input.releaseDate || null }), now);
      this.database.exec("COMMIT");
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
    return this.listReleases().find((item) => item.id === input.id)!;
  }

  deleteRelease(releaseId: string): void {
    const release = this.database.prepare("SELECT project_id AS projectId, title FROM releases WHERE id = ?").get(releaseId) as { projectId: string; title: string } | undefined;
    if (!release) throw new Error("Release not found");
    const now = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("INSERT INTO events (entity_type, entity_id, event_type, payload_json, created_at) VALUES ('release', ?, 'release.deleted', ?, ?)").run(releaseId, JSON.stringify({ title: release.title, projectId: release.projectId }), now);
      this.database.prepare("DELETE FROM projects WHERE id = ?").run(release.projectId);
      this.database.exec("COMMIT");
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }

  getSetting<T>(key: string, fallback: T): T {
    const row = this.database.prepare("SELECT value_json AS valueJson FROM settings WHERE key = ?").get(key) as { valueJson: string } | undefined;
    if (!row) return fallback;
    try { return JSON.parse(row.valueJson) as T; } catch { return fallback; }
  }

  setSetting<T>(key: string, value: T): void {
    const now = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).run(key, JSON.stringify(value), now);
  }

  listDrafts(releaseId?: string | null): DraftSummary[] {
    const where = releaseId ? "WHERE r.id = ?" : "";
    const statement = this.database.prepare(`
      SELECT d.id, r.id AS releaseId, d.campaign_id AS campaignId, r.title AS releaseTitle,
             d.channel, d.language, d.content, d.status, d.model_name AS model,
             d.created_at AS createdAt, d.updated_at AS updatedAt
      FROM drafts d
      JOIN campaigns c ON c.id = d.campaign_id
      JOIN releases r ON r.id = c.release_id
      ${where}
      ORDER BY d.created_at DESC, d.id DESC
      LIMIT 100
    `);
    return (releaseId ? statement.all(releaseId) : statement.all()) as unknown as DraftSummary[];
  }

  saveGeneratedDraft(input: SaveGeneratedDraftInput): DraftSummary {
    const content = input.content.trim();
    if (!content) throw new Error("Draft content cannot be empty");
    const release = this.database.prepare("SELECT id, title FROM releases WHERE id = ?").get(input.releaseId) as { id: string; title: string } | undefined;
    if (!release) throw new Error("Release not found");
    const now = new Date().toISOString();
    let campaign = this.database.prepare("SELECT id FROM campaigns WHERE release_id = ? AND status = 'draft' ORDER BY created_at LIMIT 1").get(input.releaseId) as { id: string } | undefined;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      if (!campaign) {
        campaign = { id: randomUUID() };
        this.database.prepare("INSERT INTO campaigns (id, release_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(campaign.id, input.releaseId, `${release.title} Campaign`, now, now);
      }
      const draftId = randomUUID();
      this.database.prepare(`
        INSERT INTO drafts (id, campaign_id, channel, language, content, model_name, prompt_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'ollama-campaign-v1', ?, ?)
      `).run(draftId, campaign.id, input.channel, input.language, content, input.model, now, now);
      this.database.prepare("INSERT INTO events (entity_type, entity_id, event_type, payload_json, created_at) VALUES ('draft', ?, 'draft.created', ?, ?)").run(draftId, JSON.stringify({ releaseId: input.releaseId, campaignId: campaign.id }), now);
      this.database.exec("COMMIT");
      return { id: draftId, releaseId: input.releaseId, campaignId: campaign.id, releaseTitle: release.title, channel: input.channel, language: input.language, content, status: "draft", model: input.model, createdAt: now, updatedAt: now };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  updateDraftStatus(draftId: string, nextStatus: DraftStatus): DraftSummary {
    const current = this.database.prepare("SELECT status FROM drafts WHERE id = ?").get(draftId) as { status: DraftStatus } | undefined;
    if (!current) throw new Error("Draft not found");
    const transitions: Record<DraftStatus, DraftStatus[]> = {
      draft: ["approved", "rejected"],
      approved: ["draft", "scheduled"],
      scheduled: ["approved", "published"],
      published: [],
      rejected: ["draft"]
    };
    if (!transitions[current.status].includes(nextStatus)) throw new Error(`Invalid draft transition: ${current.status} → ${nextStatus}`);
    const now = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("UPDATE drafts SET status = ?, updated_at = ? WHERE id = ?").run(nextStatus, now, draftId);
      this.database.prepare("INSERT INTO events (entity_type, entity_id, event_type, payload_json, created_at) VALUES ('draft', ?, 'draft.status_changed', ?, ?)").run(draftId, JSON.stringify({ from: current.status, to: nextStatus }), now);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return this.listDrafts().find((draft) => draft.id === draftId)!;
  }

  listAssets(releaseId: string): AssetSummary[] {
    const rows = this.database.prepare(`
      SELECT a.id, r.id AS releaseId, a.track_id AS trackId, a.kind, a.file_path AS filePath,
             a.mime_type AS mimeType, a.metadata_json AS metadataJson, a.created_at AS createdAt
      FROM assets a
      JOIN projects p ON p.id = a.project_id
      JOIN releases r ON r.project_id = p.id
      WHERE r.id = ?
      ORDER BY a.created_at DESC, a.id DESC
    `).all(releaseId) as unknown as Array<Omit<AssetSummary, "fileName" | "sizeBytes" | "modifiedAt" | "width" | "height"> & { metadataJson: string }>;
    return rows.map(({ metadataJson, ...row }) => {
      const metadata = JSON.parse(metadataJson) as { fileName?: string; sizeBytes?: number; modifiedAt?: string | null; width?: number | null; height?: number | null };
      return { ...row, fileName: metadata.fileName ?? row.filePath.split(/[\\/]/).pop() ?? row.filePath, sizeBytes: metadata.sizeBytes ?? 0, modifiedAt: metadata.modifiedAt ?? null, width: metadata.width ?? null, height: metadata.height ?? null };
    });
  }

  attachAsset(input: AttachAssetInput): AssetSummary {
    const link = this.database.prepare(`
      SELECT r.project_id AS projectId, rt.track_id AS trackId
      FROM releases r
      LEFT JOIN release_tracks rt ON rt.release_id = r.id AND rt.position = 1
      WHERE r.id = ?
    `).get(input.releaseId) as { projectId: string; trackId: string | null } | undefined;
    if (!link) throw new Error("Release not found");
    const existing = this.listAssets(input.releaseId).find((asset) => asset.kind === input.kind && asset.filePath === input.filePath);
    if (existing) return existing;
    const id = randomUUID();
    const now = new Date().toISOString();
    const metadata = JSON.stringify({ fileName: input.fileName, sizeBytes: input.sizeBytes, modifiedAt: input.modifiedAt, width: input.width, height: input.height });
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const replaced = this.database.prepare("SELECT id FROM assets WHERE project_id = ? AND kind = ?").all(link.projectId, input.kind) as unknown as Array<{ id: string }>;
      for (const item of replaced) this.database.prepare("DELETE FROM assets WHERE id = ?").run(item.id);
      this.database.prepare("INSERT INTO assets (id, project_id, track_id, kind, file_path, mime_type, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, link.projectId, link.trackId, input.kind, input.filePath, input.mimeType, metadata, now);
      this.database.prepare("INSERT INTO events (entity_type, entity_id, event_type, payload_json, created_at) VALUES ('asset', ?, 'asset.attached', ?, ?)").run(id, JSON.stringify({ releaseId: input.releaseId, kind: input.kind, filePath: input.filePath, replacedAssetIds: replaced.map((item) => item.id) }), now);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return { id, releaseId: input.releaseId, trackId: link.trackId, kind: input.kind, filePath: input.filePath, fileName: input.fileName, mimeType: input.mimeType, sizeBytes: input.sizeBytes, modifiedAt: input.modifiedAt, createdAt: now, width: input.width, height: input.height };
  }

  detachAsset(assetId: string): void {
    const asset = this.database.prepare("SELECT kind, file_path AS filePath FROM assets WHERE id = ?").get(assetId) as { kind: string; filePath: string } | undefined;
    if (!asset) throw new Error("Asset not found");
    const now = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("DELETE FROM assets WHERE id = ?").run(assetId);
      this.database.prepare("INSERT INTO events (entity_type, entity_id, event_type, payload_json, created_at) VALUES ('asset', ?, 'asset.detached', ?, ?)").run(assetId, JSON.stringify(asset), now);
      this.database.exec("COMMIT");
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }

  getAssetForAnalysis(assetId: string): { id: string; kind: string; filePath: string } | null {
    return (this.database.prepare("SELECT id, kind, file_path AS filePath FROM assets WHERE id = ?").get(assetId) as { id: string; kind: string; filePath: string } | undefined) ?? null;
  }

  getAudioAnalysis(assetId: string): AudioAnalysisSummary | null {
    return (this.database.prepare(`
      SELECT id, asset_id AS assetId, status, analyzer, format,
             duration_seconds AS durationSeconds, sample_rate AS sampleRate,
             channels, bit_depth AS bitDepth, integrated_lufs AS integratedLufs,
             loudness_range_lu AS loudnessRangeLu, true_peak_dbtp AS truePeakDbtp,
             bpm, bpm_confidence AS bpmConfidence, alternate_bpm AS alternateBpm,
             musical_key AS musicalKey, key_confidence AS keyConfidence,
             alternate_key AS alternateKey,
             analyzed_at AS analyzedAt, note
      FROM audio_analyses WHERE asset_id = ?
    `).get(assetId) as unknown as AudioAnalysisSummary | undefined) ?? null;
  }

  saveAudioAnalysis(analysis: AudioAnalysisSummary): AudioAnalysisSummary {
    this.database.prepare(`
      INSERT INTO audio_analyses (
        id, asset_id, status, analyzer, format, duration_seconds, sample_rate,
        channels, bit_depth, integrated_lufs, loudness_range_lu, true_peak_dbtp,
        bpm, bpm_confidence, alternate_bpm, musical_key, key_confidence, alternate_key,
        note, analyzed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(asset_id) DO UPDATE SET
        id=excluded.id, status=excluded.status, analyzer=excluded.analyzer,
        format=excluded.format, duration_seconds=excluded.duration_seconds,
        sample_rate=excluded.sample_rate, channels=excluded.channels,
        bit_depth=excluded.bit_depth, integrated_lufs=excluded.integrated_lufs,
        loudness_range_lu=excluded.loudness_range_lu, true_peak_dbtp=excluded.true_peak_dbtp,
        bpm=excluded.bpm, bpm_confidence=excluded.bpm_confidence,
        alternate_bpm=excluded.alternate_bpm, musical_key=excluded.musical_key,
        key_confidence=excluded.key_confidence, alternate_key=excluded.alternate_key,
        note=excluded.note, analyzed_at=excluded.analyzed_at
    `).run(
      analysis.id, analysis.assetId, analysis.status, analysis.analyzer, analysis.format,
      analysis.durationSeconds, analysis.sampleRate, analysis.channels, analysis.bitDepth,
      analysis.integratedLufs, analysis.loudnessRangeLu, analysis.truePeakDbtp,
      analysis.bpm, analysis.bpmConfidence, analysis.alternateBpm,
      analysis.musicalKey, analysis.keyConfidence, analysis.alternateKey,
      analysis.note, analysis.analyzedAt
    );
    this.database.prepare("INSERT INTO events (entity_type, entity_id, event_type, payload_json, created_at) VALUES ('asset', ?, 'audio.analyzed', ?, ?)").run(analysis.assetId, JSON.stringify({ analyzer: analysis.analyzer, status: analysis.status }), analysis.analyzedAt);
    return this.getAudioAnalysis(analysis.assetId)!;
  }

  getReleaseReadiness(releaseId: string): ReleaseReadiness {
    const release = this.database.prepare(`
      SELECT r.id, r.release_date AS releaseDate, r.title, p.artist_id AS artistId,
             t.primary_genre AS primaryGenre, t.story
      FROM releases r
      JOIN projects p ON p.id = r.project_id
      JOIN release_tracks rt ON rt.release_id = r.id AND rt.position = 1
      JOIN tracks t ON t.id = rt.track_id
      WHERE r.id = ?
    `).get(releaseId) as { id: string; releaseDate: string | null; title: string; artistId: string; primaryGenre: string; story: string } | undefined;
    if (!release) throw new Error("Release not found");
    const assets = this.listAssets(releaseId);
    const audio = assets.find((asset) => asset.kind === "audio");
    const cover = assets.some((asset) => asset.kind === "cover");
    const analysis = audio ? this.getAudioAnalysis(audio.id) : null;
    const approved = Number((this.database.prepare(`
      SELECT COUNT(*) AS count FROM drafts d
      JOIN campaigns c ON c.id = d.campaign_id
      WHERE c.release_id = ? AND d.status IN ('approved','scheduled','published')
    `).get(releaseId) as { count: number }).count) > 0;
    const metadata = Boolean(release.title.trim() && release.artistId && release.primaryGenre.trim() && release.story.trim());
    const checks: ReleaseReadiness["checks"] = [
      { id: "audio", label: "Master audio", complete: Boolean(audio), weight: 20, detail: audio ? audio.fileName : "Attach the final master" },
      { id: "analysis", label: "Audio analysis", complete: Boolean(analysis), weight: 15, detail: analysis ? "Technical and musical analysis saved" : "Analyze the attached master" },
      { id: "cover", label: "Cover artwork", complete: cover, weight: 15, detail: cover ? "Cover attached" : "Attach release artwork" },
      { id: "date", label: "Release date", complete: Boolean(release.releaseDate), weight: 15, detail: release.releaseDate ?? "Set a release date" },
      { id: "metadata", label: "Core metadata", complete: metadata, weight: 15, detail: metadata ? "Title, artist, genre and story complete" : "Complete title, artist, genre and story" },
      { id: "campaign", label: "Approved campaign", complete: approved, weight: 20, detail: approved ? "At least one draft approved" : "Approve a campaign draft" }
    ];
    const result = {
      releaseId,
      score: checks.reduce((score, check) => score + (check.complete ? check.weight : 0), 0),
      checks,
      missing: checks.filter((check) => !check.complete).map((check) => check.detail)
    };
    this.syncReadinessTasks(releaseId, checks);
    return result;
  }

  listTasks(releaseId?: string | null): TaskSummary[] {
    const where = releaseId ? "WHERE t.release_id = ?" : "";
    const statement = this.database.prepare(`
      SELECT t.id, t.release_id AS releaseId, r.title AS releaseTitle, t.title,
             t.status, t.priority, t.assignee, t.due_at AS dueAt,
             t.source_key AS sourceKey, t.agent_output AS agentOutput,
             t.model_name AS model, t.created_at AS createdAt, t.updated_at AS updatedAt
      FROM tasks t LEFT JOIN releases r ON r.id = t.release_id
      ${where}
      ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 WHEN 'done' THEN 2 ELSE 3 END,
               CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
               COALESCE(t.due_at, '9999-12-31'), t.created_at DESC
    `);
    return (releaseId ? statement.all(releaseId) : statement.all()) as unknown as TaskSummary[];
  }

  createTask(input: CreateTaskInput): TaskSummary {
    const title = input.title.trim();
    if (!title) throw new Error("Task title is required");
    if (!input.releaseId) throw new Error("Select and save a release before creating a task");
    const link = this.database.prepare("SELECT project_id AS projectId FROM releases WHERE id = ?").get(input.releaseId) as { projectId: string } | undefined;
    if (!link) throw new Error("Release not found");
    const id = randomUUID(), now = new Date().toISOString();
    this.database.prepare("INSERT INTO tasks (id, project_id, release_id, title, status, priority, assignee, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?)").run(id, link.projectId, input.releaseId, title, input.priority, input.assignee, input.dueAt || null, now, now);
    return this.listTasks().find((task) => task.id === id)!;
  }

  updateTaskStatus(taskId: string, status: TaskStatus): TaskSummary {
    const task = this.database.prepare("SELECT id, status FROM tasks WHERE id = ?").get(taskId) as { id: string; status: TaskStatus } | undefined;
    if (!task) throw new Error("Task not found");
    const now = new Date().toISOString();
    this.database.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?").run(status, now, taskId);
    this.database.prepare("INSERT INTO events (entity_type, entity_id, event_type, payload_json, created_at) VALUES ('task', ?, 'task.status_changed', ?, ?)").run(taskId, JSON.stringify({ from: task.status, to: status }), now);
    return this.listTasks().find((item) => item.id === taskId)!;
  }

  saveTaskAgentOutput(taskId: string, model: string, output: string): TaskSummary {
    const now = new Date().toISOString();
    const result = this.database.prepare("UPDATE tasks SET status = 'done', agent_output = ?, model_name = ?, updated_at = ? WHERE id = ?").run(output, model, now, taskId);
    if (!result.changes) throw new Error("Task not found");
    this.database.prepare("INSERT INTO events (entity_type, entity_id, event_type, payload_json, created_at) VALUES ('task', ?, 'task.agent_completed', ?, ?)").run(taskId, JSON.stringify({ model }), now);
    return this.listTasks().find((item) => item.id === taskId)!;
  }

  importSoundCloudTracks(items: unknown[]): SoundCloudTrackSummary[] {
    const statement = this.database.prepare(`
      INSERT INTO soundcloud_tracks (
        id, title, permalink_url, artwork_url, created_at_remote, duration_ms, sharing,
        streamable, playback_count, likes_count, comment_count, reposts_count,
        genre, tag_list, raw_json, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, permalink_url=excluded.permalink_url,
        artwork_url=excluded.artwork_url, created_at_remote=excluded.created_at_remote,
        duration_ms=excluded.duration_ms, sharing=excluded.sharing, streamable=excluded.streamable,
        playback_count=excluded.playback_count, likes_count=excluded.likes_count,
        comment_count=excluded.comment_count, reposts_count=excluded.reposts_count,
        genre=excluded.genre, tag_list=excluded.tag_list, raw_json=excluded.raw_json,
        imported_at=excluded.imported_at
    `);
    const importedAt = new Date().toISOString();
    const snapshot = this.database.prepare("INSERT INTO soundcloud_performance_snapshots (track_id, captured_at, playback_count, likes_count, comment_count, reposts_count) VALUES (?, ?, ?, ?, ?, ?)");
    this.database.exec("BEGIN IMMEDIATE");
    try {
      for (const value of items) {
        const track = value as Record<string, unknown>;
        if (typeof track.id !== "number" || typeof track.title !== "string" || typeof track.permalink_url !== "string") continue;
        statement.run(
          track.id, track.title, track.permalink_url, typeof track.artwork_url === "string" ? track.artwork_url : null,
          typeof track.created_at === "string" ? track.created_at : importedAt,
          typeof track.duration === "number" ? track.duration : 0, typeof track.sharing === "string" ? track.sharing : "public",
          track.streamable === false ? 0 : 1, numberOrNull(track.playback_count), numberOrNull(track.likes_count) ?? numberOrNull(track.favoritings_count),
          numberOrNull(track.comment_count), numberOrNull(track.reposts_count),
          typeof track.genre === "string" ? track.genre : null, typeof track.tag_list === "string" ? track.tag_list : null,
          JSON.stringify(track), importedAt
        );
        snapshot.run(track.id, importedAt, numberOrNull(track.playback_count), numberOrNull(track.likes_count) ?? numberOrNull(track.favoritings_count), numberOrNull(track.comment_count), numberOrNull(track.reposts_count));
      }
      this.database.exec("COMMIT");
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
    return this.listSoundCloudTracks();
  }

  listSoundCloudTracks(): SoundCloudTrackSummary[] {
    const rows = this.database.prepare(`
      SELECT sc.id, sc.title, sc.permalink_url AS permalinkUrl, sc.artwork_url AS artworkUrl,
             sc.created_at_remote AS createdAt, sc.duration_ms AS durationMs, sc.sharing,
             sc.streamable, sc.playback_count AS playbackCount, sc.likes_count AS likesCount,
             sc.comment_count AS commentCount, sc.reposts_count AS repostsCount,
             sc.genre, sc.tag_list AS tagList, sc.imported_at AS importedAt,
             sc.artist_id AS artistId, sc.catalog_status AS catalogStatus, sc.content_type AS contentType,
             sc.release_id AS releaseId, r.title AS releaseTitle
      FROM soundcloud_tracks sc LEFT JOIN releases r ON r.id = sc.release_id ORDER BY sc.created_at_remote DESC
    `).all() as unknown as Array<Omit<SoundCloudTrackSummary, "streamable" | "engagementRate" | "engagementScore"> & { streamable: number }>;
    return rows.map((row) => {
      const engagements = (row.likesCount ?? 0) + (row.commentCount ?? 0) + (row.repostsCount ?? 0);
      const engagementRate = row.playbackCount && row.playbackCount > 0 ? Math.round((engagements / row.playbackCount) * 10_000) / 100 : null;
      const rateComponent = Math.min(60, (engagementRate ?? 0) * 10);
      const volumeComponent = Math.min(40, Math.log10(Math.max(1, row.playbackCount ?? 0)) * 10);
      const snapshots = this.database.prepare("SELECT playback_count AS playbackCount FROM soundcloud_performance_snapshots WHERE track_id = ? ORDER BY captured_at DESC, id DESC LIMIT 2").all(row.id) as unknown as Array<{ playbackCount: number | null }>;
      const snapshotCount = (this.database.prepare("SELECT COUNT(*) AS count FROM soundcloud_performance_snapshots WHERE track_id = ?").get(row.id) as { count: number }).count;
      const playsDelta = snapshots.length > 1 && snapshots[0].playbackCount !== null && snapshots[1].playbackCount !== null ? snapshots[0].playbackCount - snapshots[1].playbackCount : null;
      const trend = playsDelta === null ? "baseline" : playsDelta > 0 ? "growing" : playsDelta < 0 ? "declining" : "stable";
      return { ...row, streamable: Boolean(row.streamable), engagementRate, engagementScore: Math.round(rateComponent + volumeComponent), trend, playsDelta, snapshotCount };
    });
  }

  getSoundCloudTrackPerformance(trackId: number): SoundCloudTrackPerformance {
    if (!this.database.prepare("SELECT 1 FROM soundcloud_tracks WHERE id = ?").get(trackId)) throw new Error("SoundCloud track not found");
    const points = this.database.prepare(`SELECT captured_at AS capturedAt, playback_count AS playbackCount, likes_count AS likesCount, comment_count AS commentCount, reposts_count AS repostsCount FROM soundcloud_performance_snapshots WHERE track_id = ? ORDER BY captured_at ASC, id ASC`).all(trackId) as unknown as SoundCloudPerformancePoint[];
    const latest = points.at(-1);
    const windows = ([7, 30, 90] as const).map((days) => {
      const cutoff = Date.now() - days * 86_400_000;
      const baseline = points.find((point) => Date.parse(point.capturedAt) >= cutoff);
      const available = Boolean(latest && baseline && baseline !== latest && Date.parse(points[0]?.capturedAt ?? "") <= cutoff);
      const delta = (latestValue: number | null | undefined, baselineValue: number | null | undefined) => available && latestValue !== null && latestValue !== undefined && baselineValue !== null && baselineValue !== undefined ? latestValue - baselineValue : null;
      return { days, available, playsDelta: delta(latest?.playbackCount, baseline?.playbackCount), likesDelta: delta(latest?.likesCount, baseline?.likesCount), commentsDelta: delta(latest?.commentCount, baseline?.commentCount), repostsDelta: delta(latest?.repostsCount, baseline?.repostsCount) };
    });
    return { trackId, points, windows };
  }

  updateSoundCloudTrack(input: UpdateSoundCloudTrackInput): SoundCloudTrackSummary {
    if (!["unreviewed", "release", "gem", "archive", "exclude"].includes(input.catalogStatus)) throw new Error("Invalid SoundCloud catalog status");
    if (!["original", "bootleg", "official-remix", "edit", "dj-set"].includes(input.contentType)) throw new Error("Invalid SoundCloud content type");
    if (input.contentType === "bootleg" && input.catalogStatus === "release") throw new Error("An uncleared bootleg cannot be marked for official release");
    if (input.artistId && !seedArtists.some(([id]) => id === input.artistId)) throw new Error("Invalid artist alias");
    const result = this.database.prepare("UPDATE soundcloud_tracks SET artist_id = ?, catalog_status = ?, content_type = ? WHERE id = ?").run(input.artistId, input.catalogStatus, input.contentType, input.id);
    if (!result.changes) throw new Error("SoundCloud track not found");
    return this.listSoundCloudTracks().find((track) => track.id === input.id)!;
  }

  setSoundCloudTracksContentType(ids: number[], contentType: SoundCloudTrackSummary["contentType"]): SoundCloudTrackSummary[] {
    if (!["original", "bootleg", "official-remix", "edit", "dj-set"].includes(contentType)) throw new Error("Invalid SoundCloud content type");
    const uniqueIds = [...new Set(ids.filter((id) => Number.isSafeInteger(id)))];
    const update = this.database.prepare("UPDATE soundcloud_tracks SET content_type = ?, catalog_status = CASE WHEN ? = 'bootleg' AND catalog_status = 'release' THEN 'unreviewed' ELSE catalog_status END WHERE id = ?");
    this.database.exec("BEGIN IMMEDIATE");
    try { for (const id of uniqueIds) update.run(contentType, contentType, id); this.database.exec("COMMIT"); }
    catch (error) { this.database.exec("ROLLBACK"); throw error; }
    return this.listSoundCloudTracks();
  }

  linkSoundCloudTrack(trackId: number, releaseId: string | null): SoundCloudTrackSummary {
    const track = this.listSoundCloudTracks().find((item) => item.id === trackId);
    if (!track) throw new Error("SoundCloud track not found");
    if (releaseId) {
      const release = this.database.prepare("SELECT id, status FROM releases WHERE id = ?").get(releaseId) as { id: string; status: string } | undefined;
      if (!release) throw new Error("Release not found");
      if (track.contentType === "bootleg" && ["scheduled", "published"].includes(release.status)) throw new Error("An uncleared bootleg cannot be linked to an official scheduled or published release");
    }
    try { this.database.prepare("UPDATE soundcloud_tracks SET release_id = ? WHERE id = ?").run(releaseId, trackId); }
    catch (error) { if (String(error).includes("UNIQUE")) throw new Error("This release is already linked to another SoundCloud track"); throw error; }
    return this.listSoundCloudTracks().find((item) => item.id === trackId)!;
  }

  private syncReadinessTasks(releaseId: string, checks: ReleaseReadiness["checks"]): void {
    const link = this.database.prepare("SELECT project_id AS projectId FROM releases WHERE id = ?").get(releaseId) as { projectId: string };
    const now = new Date().toISOString();
    for (const check of checks) {
      const sourceKey = "readiness:" + releaseId + ":" + check.id;
      const assignee = check.id === "analysis" ? "automatic" : check.id === "campaign" ? "ai" : "human";
      this.database.prepare(`
        INSERT OR IGNORE INTO tasks (id, project_id, release_id, title, status, priority, assignee, source_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), link.projectId, releaseId, check.detail, check.complete ? "done" : "todo", check.weight >= 20 ? "high" : "medium", assignee, sourceKey, now, now);
      this.database.prepare("UPDATE tasks SET title = ?, status = ?, priority = ?, assignee = ?, updated_at = ? WHERE source_key = ?").run(check.detail, check.complete ? "done" : "todo", check.weight >= 20 ? "high" : "medium", assignee, now, sourceKey);
    }
  }

  close(): void { this.database.close(); }

  private seedArtistProfiles(): void {
    const insert = this.database.prepare(`
      INSERT INTO artist_profiles (id, name, genres_json, voice, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `);
    const now = new Date().toISOString();
    for (const [id, name, genres, voice] of seedArtists) insert.run(id, name, JSON.stringify(genres), voice, now, now);
  }
}

function numberOrNull(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
