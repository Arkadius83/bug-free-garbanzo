import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CreateReleaseDraftInput, DatabaseHealth, ReleaseSummary } from "../../shared/contracts.js";
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
