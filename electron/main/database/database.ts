import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AssetSummary, AttachAssetInput, AudioAnalysisSummary, CreateReleaseDraftInput, DatabaseHealth, DraftStatus, DraftSummary, ReleaseReadiness, ReleaseSummary, SaveGeneratedDraftInput } from "../../shared/contracts.js";
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
    `).all(releaseId) as unknown as Array<Omit<AssetSummary, "fileName" | "sizeBytes" | "modifiedAt"> & { metadataJson: string }>;
    return rows.map(({ metadataJson, ...row }) => {
      const metadata = JSON.parse(metadataJson) as { fileName?: string; sizeBytes?: number; modifiedAt?: string | null };
      return { ...row, fileName: metadata.fileName ?? row.filePath.split(/[\\/]/).pop() ?? row.filePath, sizeBytes: metadata.sizeBytes ?? 0, modifiedAt: metadata.modifiedAt ?? null };
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
    const metadata = JSON.stringify({ fileName: input.fileName, sizeBytes: input.sizeBytes, modifiedAt: input.modifiedAt });
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("INSERT INTO assets (id, project_id, track_id, kind, file_path, mime_type, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, link.projectId, link.trackId, input.kind, input.filePath, input.mimeType, metadata, now);
      this.database.prepare("INSERT INTO events (entity_type, entity_id, event_type, payload_json, created_at) VALUES ('asset', ?, 'asset.attached', ?, ?)").run(id, JSON.stringify({ releaseId: input.releaseId, kind: input.kind, filePath: input.filePath }), now);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return { id, releaseId: input.releaseId, trackId: link.trackId, kind: input.kind, filePath: input.filePath, fileName: input.fileName, mimeType: input.mimeType, sizeBytes: input.sizeBytes, modifiedAt: input.modifiedAt, createdAt: now };
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
    return {
      releaseId,
      score: checks.reduce((score, check) => score + (check.complete ? check.weight : 0), 0),
      checks,
      missing: checks.filter((check) => !check.complete).map((check) => check.detail)
    };
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
