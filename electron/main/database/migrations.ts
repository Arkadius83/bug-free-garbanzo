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
  },
  {
    version: 5,
    name: "tasks_calendar_agents_v1",
    sql: `
      ALTER TABLE tasks ADD COLUMN release_id TEXT REFERENCES releases(id) ON DELETE CASCADE;
      ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high'));
      ALTER TABLE tasks ADD COLUMN assignee TEXT NOT NULL DEFAULT 'human' CHECK (assignee IN ('human','ai','automatic'));
      ALTER TABLE tasks ADD COLUMN source_key TEXT;
      ALTER TABLE tasks ADD COLUMN agent_output TEXT;
      ALTER TABLE tasks ADD COLUMN model_name TEXT;
      CREATE UNIQUE INDEX idx_tasks_source_key ON tasks(source_key) WHERE source_key IS NOT NULL;
      CREATE INDEX idx_tasks_release ON tasks(release_id, due_at);
    `
  },
  {
    version: 6,
    name: "soundcloud_catalog_v1",
    sql: `
      CREATE TABLE soundcloud_tracks (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        permalink_url TEXT NOT NULL,
        artwork_url TEXT,
        created_at_remote TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        sharing TEXT NOT NULL,
        streamable INTEGER NOT NULL,
        playback_count INTEGER,
        likes_count INTEGER,
        comment_count INTEGER,
        reposts_count INTEGER,
        genre TEXT,
        tag_list TEXT,
        raw_json TEXT NOT NULL,
        imported_at TEXT NOT NULL
      );
      CREATE INDEX idx_soundcloud_tracks_created ON soundcloud_tracks(created_at_remote DESC);
    `
  },
  {
    version: 7,
    name: "soundcloud_catalog_classification_v2",
    sql: `
      ALTER TABLE soundcloud_tracks ADD COLUMN artist_id TEXT REFERENCES artist_profiles(id) ON DELETE SET NULL;
      ALTER TABLE soundcloud_tracks ADD COLUMN catalog_status TEXT NOT NULL DEFAULT 'unreviewed'
        CHECK(catalog_status IN ('unreviewed', 'release', 'gem', 'archive', 'exclude'));
      CREATE INDEX idx_soundcloud_tracks_catalog ON soundcloud_tracks(catalog_status, artist_id);
    `
  },
  {
    version: 8,
    name: "soundcloud_content_type_v1",
    sql: `
      ALTER TABLE soundcloud_tracks ADD COLUMN content_type TEXT NOT NULL DEFAULT 'original'
        CHECK(content_type IN ('original', 'bootleg', 'official-remix', 'edit', 'dj-set'));
      CREATE INDEX idx_soundcloud_tracks_content_type ON soundcloud_tracks(content_type);
    `
  },
  {
    version: 9,
    name: "soundcloud_release_link_v1",
    sql: `
      ALTER TABLE soundcloud_tracks ADD COLUMN release_id TEXT REFERENCES releases(id) ON DELETE SET NULL;
      CREATE UNIQUE INDEX idx_soundcloud_tracks_release ON soundcloud_tracks(release_id) WHERE release_id IS NOT NULL;
    `
  },
  {
    version: 10,
    name: "soundcloud_performance_history_v1",
    sql: `
      CREATE TABLE soundcloud_performance_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id INTEGER NOT NULL REFERENCES soundcloud_tracks(id) ON DELETE CASCADE,
        captured_at TEXT NOT NULL,
        playback_count INTEGER,
        likes_count INTEGER,
        comment_count INTEGER,
        reposts_count INTEGER
      );
      CREATE INDEX idx_soundcloud_snapshots_track_time ON soundcloud_performance_snapshots(track_id, captured_at DESC);
    `
  },
  {
    version: 11,
    name: "spotify_catalog_v1",
    sql: `
      CREATE TABLE spotify_releases (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, album_type TEXT NOT NULL,
        release_date TEXT NOT NULL, total_tracks INTEGER NOT NULL, image_url TEXT,
        spotify_url TEXT NOT NULL, spotify_artist_id TEXT NOT NULL,
        artist_id TEXT NOT NULL REFERENCES artist_profiles(id), raw_json TEXT NOT NULL,
        imported_at TEXT NOT NULL
      );
      CREATE INDEX idx_spotify_releases_artist_date ON spotify_releases(artist_id, release_date DESC);
    `
  },
  {
    version: 12,
    name: "unified_catalog_matching_v1",
    sql: `
      ALTER TABLE spotify_releases ADD COLUMN release_id TEXT REFERENCES releases(id) ON DELETE SET NULL;
      CREATE UNIQUE INDEX idx_spotify_releases_local_release ON spotify_releases(release_id) WHERE release_id IS NOT NULL;
    `
  },
  {
    version: 13,
    name: "campaign_pack_generator_v1",
    sql: `
      CREATE TABLE campaign_pack_items (
        id TEXT PRIMARY KEY,
        release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK(kind IN ('caption','video-hook','video-script','image-prompt','visualizer-prompt')),
        channel TEXT,
        language TEXT NOT NULL CHECK(language IN ('pl','de','en')),
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','scheduled','published','rejected')),
        model_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_campaign_pack_release ON campaign_pack_items(release_id, created_at DESC);
    `
  },
  {
    version: 14,
    name: "media_generation_gallery_v1",
    sql: `
      CREATE TABLE media_generations (
        id TEXT PRIMARY KEY,
        release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
        campaign_pack_item_id TEXT NOT NULL REFERENCES campaign_pack_items(id) ON DELETE CASCADE,
        provider TEXT NOT NULL CHECK(provider IN ('openai','kling')),
        media_type TEXT NOT NULL CHECK(media_type IN ('image','video')),
        prompt TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('queued','generating','ready','failed','approved','rejected')),
        provider_task_id TEXT,
        local_path TEXT,
        mime_type TEXT,
        error TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_media_generations_release ON media_generations(release_id, created_at DESC);
    `
  },
  {
    version: 15,
    name: "comfyui_media_provider_v1",
    sql: `
      CREATE TABLE media_generations_v2 (
        id TEXT PRIMARY KEY,
        release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
        campaign_pack_item_id TEXT NOT NULL REFERENCES campaign_pack_items(id) ON DELETE CASCADE,
        provider TEXT NOT NULL CHECK(provider IN ('openai','kling','comfyui')),
        media_type TEXT NOT NULL CHECK(media_type IN ('image','video')),
        prompt TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('queued','generating','ready','failed','approved','rejected')),
        provider_task_id TEXT, local_path TEXT, mime_type TEXT, error TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO media_generations_v2 SELECT * FROM media_generations;
      DROP TABLE media_generations;
      ALTER TABLE media_generations_v2 RENAME TO media_generations;
      CREATE INDEX idx_media_generations_release ON media_generations(release_id, created_at DESC);
    `
  },
  {
    version: 16,
    name: "publishing_queue_calendar_v1",
    sql: `
      CREATE TABLE publishing_queue (
        id TEXT PRIMARY KEY,
        release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
        campaign_pack_item_id TEXT NOT NULL REFERENCES campaign_pack_items(id) ON DELETE CASCADE,
        media_generation_id TEXT REFERENCES media_generations(id) ON DELETE SET NULL,
        platform TEXT NOT NULL CHECK(platform IN ('Instagram','Facebook','TikTok','SoundCloud','YouTube')),
        caption TEXT NOT NULL,
        scheduled_at TEXT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','scheduled','published','failed')),
        error TEXT,
        exported_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_publishing_queue_schedule ON publishing_queue(scheduled_at, status);
      CREATE INDEX idx_publishing_queue_release ON publishing_queue(release_id, created_at DESC);
    `
  },
  {
    version: 17,
    name: "brand_profiles_prompt_templates_v1",
    sql: `
      CREATE TABLE brand_profiles (
        artist_id TEXT PRIMARY KEY REFERENCES artist_profiles(id) ON DELETE CASCADE,
        visual_direction TEXT NOT NULL, palette TEXT NOT NULL, typography TEXT NOT NULL,
        required_elements TEXT NOT NULL, forbidden_elements TEXT NOT NULL,
        negative_prompt TEXT NOT NULL, default_aspect_ratio TEXT NOT NULL CHECK(default_aspect_ratio IN ('1:1','4:5','9:16','16:9')),
        updated_at TEXT NOT NULL
      );
    `
  },
  {
    version: 18,
    name: "contacts_crm_v1",
    sql: `
      CREATE TABLE contacts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        contact_type TEXT NOT NULL CHECK(contact_type IN ('artist','vocalist','producer','label','promoter','playlist-curator','press','other')),
        relationship_status TEXT NOT NULL CHECK(relationship_status IN ('new','to-contact','contacted','conversation','collaboration','declined','inactive')),
        artist_id TEXT REFERENCES artist_profiles(id) ON DELETE SET NULL,
        release_id TEXT REFERENCES releases(id) ON DELETE SET NULL,
        organization TEXT, email TEXT, phone TEXT, website TEXT, social_handle TEXT,
        preferred_channel TEXT NOT NULL CHECK(preferred_channel IN ('email','instagram','tiktok','soundcloud','phone','other')),
        consent INTEGER NOT NULL DEFAULT 0 CHECK(consent IN (0,1)),
        notes TEXT NOT NULL DEFAULT '', next_follow_up_at TEXT, last_contact_at TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_contacts_status ON contacts(relationship_status, next_follow_up_at);
      CREATE INDEX idx_contacts_artist ON contacts(artist_id, contact_type);
      CREATE TABLE contact_interactions (
        id TEXT PRIMARY KEY,
        contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        channel TEXT NOT NULL CHECK(channel IN ('email','instagram','tiktok','soundcloud','phone','meeting','other')),
        direction TEXT NOT NULL CHECK(direction IN ('outbound','inbound','note')),
        summary TEXT NOT NULL, occurred_at TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX idx_contact_interactions_contact ON contact_interactions(contact_id, occurred_at DESC);
    `
  },
  {
    version: 19,
    name: "meta_publishing_v1",
    sql: `
      ALTER TABLE publishing_queue ADD COLUMN remote_post_id TEXT;
      ALTER TABLE publishing_queue ADD COLUMN published_at TEXT;
      ALTER TABLE publishing_queue ADD COLUMN destination_id TEXT;
    `
  }
,
  {
    version: 20,
    name: "release_plan_domain_v1",
    sql: `
      CREATE TABLE release_plans (
        id TEXT PRIMARY KEY,
        release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','REVIEWED','APPROVED','EXECUTING','COMPLETED','CANCELLED','FAILED')),
        version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
        title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL DEFAULT 'local-user',
        approved_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_release_plans_release ON release_plans(release_id, created_at DESC);
      CREATE INDEX idx_release_plans_status ON release_plans(status, updated_at DESC);

      CREATE TABLE campaign_items (
        id TEXT PRIMARY KEY,
        release_plan_id TEXT NOT NULL REFERENCES release_plans(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        purpose TEXT NOT NULL DEFAULT '',
        content_type TEXT NOT NULL CHECK(content_type IN ('caption','video-hook','video-script','image-prompt','visualizer-prompt','story','email','other')),
        target_platforms_json TEXT NOT NULL DEFAULT '[]',
        planned_date TEXT,
        planned_time TEXT,
        cta TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        asset_requirements_json TEXT NOT NULL DEFAULT '[]',
        copy_requirements_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','READY','APPROVED','CANCELLED')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(release_plan_id, sort_order)
      );
      CREATE INDEX idx_campaign_items_plan_order ON campaign_items(release_plan_id, sort_order, created_at);

      CREATE TABLE approval_records (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('release_plan')),
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL CHECK(action IN ('SUBMITTED','APPROVED','REJECTED','REVISION_REQUESTED')),
        actor TEXT NOT NULL DEFAULT 'local-user',
        reason TEXT NOT NULL DEFAULT '',
        previous_status TEXT,
        new_status TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_approval_records_entity ON approval_records(entity_type, entity_id, created_at);
    `
  },
  {
    version: 21,
    name: "release_plan_revisioning_v1",
    sql: `
      ALTER TABLE release_plans ADD COLUMN revision_number INTEGER NOT NULL DEFAULT 1 CHECK(revision_number >= 1);
      ALTER TABLE release_plans ADD COLUMN previous_plan_id TEXT REFERENCES release_plans(id) ON DELETE SET NULL;
      CREATE INDEX idx_release_plans_revision ON release_plans(release_id, revision_number DESC, created_at DESC);
      CREATE INDEX idx_release_plans_previous ON release_plans(previous_plan_id);
    `
  },
  {
    version: 22,
    name: "promo_generation_v1",
    sql: `
      CREATE TABLE promo_generations (
        id TEXT PRIMARY KEY,
        release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
        release_plan_id TEXT NOT NULL REFERENCES release_plans(id) ON DELETE CASCADE,
        campaign_item_id TEXT NOT NULL REFERENCES campaign_items(id) ON DELETE CASCADE,
        content_type TEXT NOT NULL,
        generated_content TEXT NOT NULL DEFAULT '',
        campaign_pack_item_id TEXT REFERENCES campaign_pack_items(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK(status IN ('SUCCESS','FAILED','SKIPPED')),
        error TEXT,
        model TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_promo_generations_plan ON promo_generations(release_plan_id, created_at);
      CREATE INDEX idx_promo_generations_item ON promo_generations(campaign_item_id);
      CREATE UNIQUE INDEX idx_promo_generations_item_unique ON promo_generations(campaign_item_id);
    `
  },
  {
    version: 23,
    name: "promo_review_workflow",
    sql: `
      ALTER TABLE promo_generations ADD COLUMN review_status TEXT NOT NULL DEFAULT 'GENERATED';
      ALTER TABLE promo_generations ADD COLUMN original_content TEXT;
      ALTER TABLE promo_generations ADD COLUMN edited_content TEXT;
      ALTER TABLE promo_generations ADD COLUMN review_actor TEXT;
      ALTER TABLE promo_generations ADD COLUMN review_reason TEXT;
      ALTER TABLE promo_generations ADD COLUMN reviewed_at TEXT;
    `
  },
  {
    version: 24,
    name: "schedule_events_v1",
    sql: `
      CREATE TABLE schedule_events (
        id TEXT PRIMARY KEY,
        release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
        release_plan_id TEXT NOT NULL REFERENCES release_plans(id) ON DELETE CASCADE,
        campaign_item_id TEXT NOT NULL REFERENCES campaign_items(id) ON DELETE CASCADE,
        promo_generation_id TEXT NOT NULL REFERENCES promo_generations(id) ON DELETE CASCADE,
        platform TEXT NOT NULL CHECK(platform IN ('Instagram','Facebook','TikTok','SoundCloud','YouTube')),
        scheduled_at TEXT NOT NULL,
        timezone TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SCHEDULED','CANCELLED','READY')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(promo_generation_id, platform, scheduled_at)
      );
      CREATE INDEX idx_schedule_events_release_time ON schedule_events(release_id, scheduled_at, status);
      CREATE INDEX idx_schedule_events_plan ON schedule_events(release_plan_id, scheduled_at);
      CREATE INDEX idx_schedule_events_promo ON schedule_events(promo_generation_id);
    `
  },
  {
    version: 25,
    name: "schedule_event_publishing_queue_bridge_v1",
    sql: `
      ALTER TABLE schedule_events ADD COLUMN publishing_queue_id TEXT REFERENCES publishing_queue(id) ON DELETE SET NULL;
      ALTER TABLE schedule_events ADD COLUMN queued_at TEXT;
      ALTER TABLE schedule_events ADD COLUMN queued_by TEXT;
      CREATE UNIQUE INDEX idx_schedule_events_publishing_queue ON schedule_events(publishing_queue_id) WHERE publishing_queue_id IS NOT NULL;
    `
  }
,
  {
    version: 26,
    name: "publishing_queue_review_v1",
    sql: `
      ALTER TABLE publishing_queue ADD COLUMN reviewed_by TEXT;
      ALTER TABLE publishing_queue ADD COLUMN reviewed_at TEXT;
      ALTER TABLE publishing_queue ADD COLUMN review_reason TEXT;
      CREATE INDEX idx_publishing_queue_review ON publishing_queue(status, reviewed_at DESC);
    `
  },
  {
    version: 27,
    name: "artist_promotion_profiles_v1",
    sql: `
      CREATE TABLE artist_promotion_profiles (
        artist_id TEXT PRIMARY KEY REFERENCES artist_profiles(id) ON DELETE CASCADE,
        tone_of_voice TEXT NOT NULL DEFAULT '',
        languages_json TEXT NOT NULL DEFAULT '["en"]',
        posting_frequency TEXT NOT NULL DEFAULT '',
        preferred_content_types_json TEXT NOT NULL DEFAULT '[]',
        avoided_content_types_json TEXT NOT NULL DEFAULT '[]',
        hashtag_rules TEXT NOT NULL DEFAULT '',
        emoji_rules TEXT NOT NULL DEFAULT '',
        call_to_action_rules TEXT NOT NULL DEFAULT '',
        platform_preferences_json TEXT NOT NULL DEFAULT '{}',
        default_approval_mode TEXT NOT NULL DEFAULT 'manual' CHECK(default_approval_mode IN ('manual','auto')),
        updated_at TEXT NOT NULL
      );
    `
  },
  {
    version: 28,
    name: "publishing_queue_publishing_status_v1",
    sql: `
      CREATE TABLE publishing_queue_v2 (
        id TEXT PRIMARY KEY,
        release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
        campaign_pack_item_id TEXT NOT NULL REFERENCES campaign_pack_items(id) ON DELETE CASCADE,
        media_generation_id TEXT REFERENCES media_generations(id) ON DELETE SET NULL,
        platform TEXT NOT NULL CHECK(platform IN ('Instagram','Facebook','TikTok','SoundCloud','YouTube')),
        caption TEXT NOT NULL,
        scheduled_at TEXT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','scheduled','publishing','published','failed')),
        error TEXT,
        exported_at TEXT,
        remote_post_id TEXT,
        published_at TEXT,
        destination_id TEXT,
        reviewed_by TEXT,
        reviewed_at TEXT,
        review_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO publishing_queue_v2 SELECT id,release_id,campaign_pack_item_id,media_generation_id,platform,caption,scheduled_at,status,error,exported_at,remote_post_id,published_at,destination_id,reviewed_by,reviewed_at,review_reason,created_at,updated_at FROM publishing_queue;
      DROP TABLE publishing_queue;
      ALTER TABLE publishing_queue_v2 RENAME TO publishing_queue;
      CREATE INDEX idx_publishing_queue_schedule ON publishing_queue(scheduled_at, status);
      CREATE INDEX idx_publishing_queue_release ON publishing_queue(release_id, created_at DESC);
      CREATE INDEX idx_publishing_queue_review ON publishing_queue(status, reviewed_at DESC);
    `
  },
  {
    version: 29,
    name: "post_publish_analytics_v1",
    sql: `
      CREATE TABLE post_publish_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        publishing_queue_item_id TEXT NOT NULL REFERENCES publishing_queue(id) ON DELETE CASCADE,
        release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
        external_post_id TEXT NOT NULL,
        platform TEXT NOT NULL CHECK(platform IN ('Instagram','Facebook')),
        verified INTEGER NOT NULL DEFAULT 0,
        verified_at TEXT,
        verification_error TEXT,
        views INTEGER,
        reach INTEGER,
        impressions INTEGER,
        likes INTEGER,
        comments INTEGER,
        shares INTEGER,
        clicks INTEGER,
        captured_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_post_publish_analytics_queue ON post_publish_analytics(publishing_queue_item_id, captured_at DESC);
      CREATE INDEX idx_post_publish_analytics_release ON post_publish_analytics(release_id, captured_at DESC);
      CREATE INDEX idx_post_publish_analytics_external ON post_publish_analytics(external_post_id, captured_at DESC);
    `
  }];
