export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: "initial_studio_schema",
    sql: `
      CREATE TABLE artist_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        genres_json TEXT NOT NULL,
        voice TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        artist_id TEXT NOT NULL REFERENCES artist_profiles(id),
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE tracks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        primary_genre TEXT NOT NULL DEFAULT '',
        story TEXT NOT NULL DEFAULT '',
        version_label TEXT NOT NULL DEFAULT 'main',
        bpm REAL,
        musical_key TEXT,
        duration_seconds REAL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE assets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        track_id TEXT REFERENCES tracks(id) ON DELETE SET NULL,
        kind TEXT NOT NULL CHECK (kind IN ('audio','cover','image','video','document','generated')),
        file_path TEXT NOT NULL,
        mime_type TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE TABLE releases (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','planned','scheduled','published','archived')),
        release_date TEXT,
        label_name TEXT,
        catalog_number TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE release_tracks (
        release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
        track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        PRIMARY KEY (release_id, track_id),
        UNIQUE (release_id, position)
      );

      CREATE TABLE campaigns (
        id TEXT PRIMARY KEY,
        release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','completed','archived')),
        starts_at TEXT,
        ends_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE campaign_assets (
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'supporting',
        PRIMARY KEY (campaign_id, asset_id)
      );

      CREATE TABLE drafts (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        channel TEXT NOT NULL,
        language TEXT NOT NULL CHECK (language IN ('pl','de','en')),
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','scheduled','published','rejected')),
        model_name TEXT,
        prompt_version TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done','cancelled')),
        due_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_projects_artist ON projects(artist_id);
      CREATE INDEX idx_tracks_project ON tracks(project_id);
      CREATE INDEX idx_releases_project ON releases(project_id);
      CREATE INDEX idx_campaigns_release ON campaigns(release_id);
      CREATE INDEX idx_drafts_campaign ON drafts(campaign_id);
      CREATE INDEX idx_events_entity ON events(entity_type, entity_id, created_at);
    `
  },
  {
    version: 2,
    name: "audio_analysis_v1",
    sql: `
      CREATE TABLE audio_analyses (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL UNIQUE REFERENCES assets(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('complete','limited')),
        analyzer TEXT NOT NULL,
        format TEXT NOT NULL,
        duration_seconds REAL NOT NULL,
        sample_rate INTEGER NOT NULL,
        channels INTEGER NOT NULL,
        bit_depth INTEGER,
        integrated_lufs REAL,
        loudness_range_lu REAL,
        true_peak_dbtp REAL,
        note TEXT,
        analyzed_at TEXT NOT NULL
      );
      CREATE INDEX idx_audio_analyses_asset ON audio_analyses(asset_id);
    `
  },
  {
    version: 3,
    name: "invalidate_incorrect_ebur128_results",
    sql: `
      DELETE FROM audio_analyses
      WHERE analyzer = 'ffmpeg-ebur128'
        AND integrated_lufs <= -69.9
        AND true_peak_dbtp > -40;
    `
  },
  {
    version: 4,
    name: "musical_analysis_v2",
    sql: `
      ALTER TABLE audio_analyses ADD COLUMN bpm REAL;
      ALTER TABLE audio_analyses ADD COLUMN bpm_confidence REAL;
      ALTER TABLE audio_analyses ADD COLUMN alternate_bpm REAL;
      ALTER TABLE audio_analyses ADD COLUMN musical_key TEXT;
      ALTER TABLE audio_analyses ADD COLUMN key_confidence REAL;
      ALTER TABLE audio_analyses ADD COLUMN alternate_key TEXT;
    `
  }
];
