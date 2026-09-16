# AI Studio Manager — Release Promotion Workflow Audit

**Phase 0: Read-Only Architecture Audit**
**Date:** 2026-09-15
**Status:** Binding until explicitly superseded

---

## A. CURRENT ARCHITECTURE MAP

### Tech Stack

| Layer | Technology |
|---|---|
| Desktop framework | Electron (latest, unpinned) |
| Renderer | React 19 + TypeScript |
| Build | Vite + `@vitejs/plugin-react` |
| Database | SQLite via Node.js built-in `node:sqlite` (`DatabaseSync`) |
| AI / LLM | Ollama local (`127.0.0.1:11434`) + harness provider router |
| Image generation | OpenAI (gpt-image-1.5), Kling, ComfyUI (local SD) |
| Audio analysis | Custom WAV-native + FFmpeg EBU R128 |
| Media bridge | Cloudflare R2 (for Instagram staging) |
| Social integrations | SoundCloud (OAuth), Spotify (OAuth), Meta/Facebook/Instagram (Graph API) |
| Testing | Node.js built-in test runner (`node --test`) for main-process only |
| Module system | ESM (`"type": "module"`), preload uses `.cts` (CommonJS) |

### Major Modules

```
+----------------------------------+
|         RENDERER (React)         |
|  App.tsx (754 lines, monolith)  |
|  ConversationWorkspace.tsx       |
|  HarnessPlanPreview.tsx          |
|  AudioPlayer.tsx                 |
+----------------------------------+
              |
              | window.studio.* (94 methods)
              | ipcRenderer.invoke / contextBridge
              |
+----------------------------------+
|      PRELOAD (index.cts)         |
|  contextBridge.exposeInMainWorld |
|  StudioApi interface binding     |
+----------------------------------+
              |
              | ipcMain.handle("studio:*")
              |
+----------------------------------+
|       MAIN PROCESS (index.ts)    |
|  StudioDatabase (SQLite)         |
|  SoundCloudClient                |
|  SpotifyClient                   |
|  MetaClient                      |
|  MediaGenerationClient           |
|  MediaBridgeClient               |
|  LocalServicesManager            |
|  ConversationProviderRouter      |
|  Harness execution engine        |
+----------------------------------+
              |
    +---------+---------+
    |         |         |
+-------+ +------+ +--------+
|SQLite | |JSON  | |File    |
|  DB   | |Files | |System  |
+-------+ +------+ +--------+
```

### Data Flow (Release Creation Example)

```
React UI (App.tsx)
  -> window.studio.createReleaseDraft(input)
    -> preload (ipcRenderer.invoke("studio:create-release-draft", input))
      -> main process ipcMain.handle handler (index.ts)
        -> studioDatabase.createReleaseDraft(input)
          -> BEGIN IMMEDIATE
          -> INSERT INTO projects
          -> INSERT INTO tracks
          -> INSERT INTO releases
          -> INSERT INTO release_tracks
          -> INSERT INTO events (audit log)
          -> COMMIT
        <- ReleaseSummary
      <- IPC response
    <- preload returns
  <- React state update
```

### Canonical Release Data Model (4-table chain)

```
artist_profiles (4 seeded artists)
  └─> projects (artist_id FK)
        └─> tracks (project_id FK, holds genre + story)
        └─> releases (project_id FK, holds status + release_date)
              └─> release_tracks (release_id + track_id, position ordering)
              └─> campaigns (release_id FK)
              │     └─> drafts (campaign_id FK)
              │     └─> campaign_assets (campaign_id + asset_id)
              └─> campaign_pack_items (release_id FK)
              │     └─> media_generations (campaign_pack_item_id FK)
              │     └─> publishing_queue (campaign_pack_item_id FK)
              └─> soundcloud_tracks (release_id FK, optional)
              └─> spotify_releases (release_id FK, optional)
              └─> contacts (release_id FK, optional)
              └─> tasks (release_id FK, optional)
```

---

## B. EXISTING REUSABLE COMPONENTS

### B.1 Release Domain

| Component | File | Line | Notes |
|---|---|---|---|
| `ReleaseSummary` interface | `electron/shared/contracts.ts` | 213-223 | Canonical release projection |
| `ReleaseStatus` type | `electron/shared/contracts.ts` | 211 | `draft\|planned\|scheduled\|published\|archived` |
| `ReleaseReadiness` interface | `electron/shared/contracts.ts` | 233-238 | 6-factor weighted readiness score |
| `ReadinessCheck` interface | `electron/shared/contracts.ts` | 225-231 | audio/analysis/cover/date/metadata/campaign |
| `CreateReleaseDraftInput` | `electron/shared/contracts.ts` | 414-420 | Create input |
| `UpdateReleaseInput` | `electron/shared/contracts.ts` | 422-425 | Update input with status |
| `StudioDatabase.createReleaseDraft()` | `electron/main/database/database.ts` | 64-91 | Transactional 4-table insert |
| `StudioDatabase.updateRelease()` | `electron/main/database/database.ts` | 93-120 | Status transition validation |
| `StudioDatabase.listReleases()` | `electron/main/database/database.ts` | 49-62 | JOIN query across 4 tables |
| `StudioDatabase.getReleaseReadiness()` | `electron/main/database/database.ts` | 318-355 | Weighted readiness computation |
| Release status transitions | `electron/main/database/database.ts` | 105-109 | State machine enforcement |

### B.2 Artist Domain

| Component | File | Line | Notes |
|---|---|---|---|
| `ArtistAlias` type | `electron/shared/contracts.ts` | 2 | Union literal of 4 aliases |
| `ArtistProfile` interface | `electron/shared/contracts.ts` | 4-9 | id, name, genres, voice |
| `artist_profiles` table | `electron/main/database/migrations.ts` | 12-19 | Seeded on init |
| Artist seed data | `electron/main/database/database.ts` | 8-13 | 4 hardcoded psytrance artists |
| `src/data/artists.ts` | `src/data/artists.ts` | 3-28 | Static renderer-side copy |

### B.3 Asset System

| Component | File | Line | Notes |
|---|---|---|---|
| `AssetKind` type | `electron/shared/contracts.ts` | 143 | `"audio"\|"cover"` (DB broader: +image/video/document/generated) |
| `AssetSummary` interface | `electron/shared/contracts.ts` | 145-158 | Full asset metadata |
| `AttachAssetInput` | `electron/shared/contracts.ts` | 183-193 | Attach new asset |
| `assets` table | `electron/main/database/migrations.ts` | 45-54 | project-scoped, kind-checked |
| `StudioDatabase.attachAsset()` | `electron/main/database/database.ts` | 231-256 | Idempotent per kind per project |
| `StudioDatabase.listAssets()` | `electron/main/database/database.ts` | 215-230 | Release-scoped asset query |
| `studio-media://` protocol | `electron/main/index.ts` | 347 | Serves asset files to renderer |

### B.4 Audio Analysis

| Component | File | Line | Notes |
|---|---|---|---|
| `AudioAnalysisSummary` | `electron/shared/contracts.ts` | 160-181 | Full analysis result |
| `analyzeAudioFile()` | `electron/main/audio-analysis.ts` | 14 | Two-tier: FFmpeg EBU R128 + WAV native |
| `audio_analyses` table | `electron/main/database/migrations.ts` | 145-162 | Per-asset analysis storage |

### B.5 Campaign / Content Generation

| Component | File | Line | Notes |
|---|---|---|---|
| `CampaignChannel` type | `electron/shared/contracts.ts` | 18 | `Instagram\|Facebook\|TikTok\|SoundCloud\|YouTube` |
| `CampaignPackKind` type | `electron/shared/contracts.ts` | 315 | `caption\|video-hook\|video-script\|image-prompt\|visualizer-prompt` |
| `CampaignPackItem` interface | `electron/shared/contracts.ts` | 316 | Structured campaign content |
| `DraftStatus` type | `electron/shared/contracts.ts` | 119 | `draft\|approved\|scheduled\|published\|rejected` |
| `DraftSummary` interface | `electron/shared/contracts.ts` | 121-133 | Generated copy per channel/language |
| `GenerateCampaignDraftInput` | `electron/shared/contracts.ts` | 98-109 | Generation input |
| `GeneratedCampaignDraft` | `electron/shared/contracts.ts` | 111-117 | Generation output |
| `generateCampaignDraft()` | `electron/main/ollama.ts` | 117-125 | Ollama copywriter prompt |
| `generateCampaignPackContent()` | `electron/main/ollama.ts` | 117-125 | 9-item structured pack |

### B.6 Media Generation

| Component | File | Line | Notes |
|---|---|---|---|
| `MediaProvider` type | `electron/shared/contracts.ts` | 318 | `openai\|kling\|comfyui` |
| `MediaGenerationStatus` | `electron/shared/contracts.ts` | 320 | `queued\|generating\|ready\|failed\|approved\|rejected` |
| `MediaGenerationSummary` | `electron/shared/contracts.ts` | 323 | Full generation record |
| `BrandProfile` interface | `electron/shared/contracts.ts` | 325 | Per-artist visual direction |
| `MediaGenerationClient` | `electron/main/media-generation.ts` | 9-23 | OpenAI/Kling/ComfyUI dispatch |
| `media_generations` table | `electron/main/database/migrations.ts` | 336-351 | Generation persistence |

### B.7 Publishing Queue

| Component | File | Line | Notes |
|---|---|---|---|
| `PublishingStatus` type | `electron/shared/contracts.ts` | 335 | `draft\|approved\|scheduled\|published\|failed` |
| `PublishingQueueItem` | `electron/shared/contracts.ts` | 336 | Full queue item |
| `publishing_queue` table | `electron/main/database/migrations.ts` | 357-373 | Schedule + publish tracking |
| `MetaClient.publishInstagram()` | `electron/main/meta.ts` | 19 | Graph API media container + publish |
| `MetaClient.publishFacebook()` | `electron/main/meta.ts` | 18 | Graph API photo/post |

### B.8 Workflow / Status Systems

| Component | File | Line | Notes |
|---|---|---|---|
| Release state machine | `electron/main/database/database.ts` | 105-109 | draft→planned→scheduled→published→archived |
| Draft state machine | `electron/main/database/database.ts` | 194-200 | draft→approved→scheduled→published or rejected |
| Campaign pack state machine | `electron/main/database/database.ts` | 506 | Same as DraftStatus |
| Publishing state machine | `electron/main/database/database.ts` | 516 | draft→approved→scheduled→published or failed |
| Task state machine | `electron/shared/contracts.ts` | 240 | todo→doing→done→cancelled |
| Media generation state machine | `electron/shared/contracts.ts` | 320 | queued→generating→ready→approved/rejected |
| Event sourcing (audit log) | `electron/main/database/migrations.ts` | 118-125 | Append-only events table |
| Harness approval + execution | `electron/main/harness-execution.ts` | 27-65 | TTL-based approval with fingerprint |

### B.9 AI Harness

| Component | File | Line | Notes |
|---|---|---|---|
| `AiHarnessRequest` | `electron/shared/contracts.ts` | 351-371 | Goal + project + execution config |
| `AiHarnessResponse` | `electron/shared/contracts.ts` | 401-413 | Plan + results + errors |
| `AiHarnessTaskStatus` | `electron/shared/contracts.ts` | 349 | 8 states from EXECUTABLE to EXECUTED |
| Harness plan runner | `electron/main/ai-harness.ts` | 50-126 | Spawns external TSX process |
| Harness execution engine | `electron/main/harness-execution.ts` | 27-323 | Approval, execution, audit |
| Provider router | `electron/main/harness-provider-router.ts` | 324-422 | Multi-provider fallback routing |
| Plan preview component | `src/HarnessPlanPreview.tsx` | 1-286 | DAG visualization + approval |
| Plan request builder | `src/harness-plan-preview-model.ts` | 1-59 | Request construction |

### B.10 IPC / API Surface

| Component | File | Line | Notes |
|---|---|---|---|
| `StudioApi` interface | `electron/shared/contracts.ts` | 427-513 | 94 methods, single contract |
| Preload bridge | `electron/preload/index.cts` | 1-98 | Maps StudioApi to IPC invoke |
| IPC handler registration | `electron/main/index.ts` | 140-310 | ipcMain.handle for all 94 methods |

---

## C. ARCHITECTURAL GAPS

### C.1 Release Plan (CRITICAL GAP)

**Status: Does not exist.**

There is no `ReleasePlan` entity, table, type, or UI anywhere in the codebase. The terms "release plan", "promotion plan", "campaign plan", and "content plan" do not appear as persisted domain objects.

What exists as partial precedents:
- `campaigns` table exists but only tracks name + status + date range (no plan content)
- `campaign_pack_items` stores generated content (captions, hooks, scripts, prompts) but these are outputs, not the plan itself
- The AI Harness has plan generation (`AiHarnessRequest` with `planOnly: true`) but this generates code-execution plans, not promotion plans
- The `HarnessPlanPreview` component is a developer tool for file-transform execution, not a promotion plan editor

**Missing:**
- A structured `release_plans` table
- A `ReleasePlan` TypeScript interface
- Plan sections (strategy, timeline, content calendar, target channels, KPIs)
- Plan-to-content generation pipeline
- Plan approval workflow
- Plan status tracking

### C.2 Approval Workflow (PARTIAL)

What exists:
- Draft approval (`DraftStatus`: draft→approved→rejected→scheduled→published)
- Campaign pack item approval (same state machine)
- Media generation approval (queued→generating→ready→approved/rejected)
- Publishing queue approval (draft→approved→scheduled→published/failed)
- Harness execution approval (TTL-based token with fingerprint)

What is missing:
- A unified approval record type (each entity has its own ad-hoc approval)
- Approval metadata (who approved, when, notes/conditions)
- Approval delegation
- Bulk approval across related items
- Release-level "ready to publish" gate

### C.3 Scheduling System (PARTIAL)

What exists:
- `publishing_queue.scheduled_at` (ISO timestamp)
- `tasks.due_at` (task deadlines)
- `campaigns.starts_at` / `ends_at` (date range)

What is missing:
- A dedicated `ScheduleEvent` type
- Platform-specific scheduling rules (best time to post)
- Calendar visualization of scheduled content
- Schedule conflict detection
- Timezone handling

### C.4 Analytics / Post-Publish (PARTIAL)

What exists:
- SoundCloud performance tracking (plays, likes, comments, reposts over time)
- Spotify catalog import
- Release readiness scoring

What is missing:
- Post-publish analytics aggregation
- Cross-platform performance comparison
- ROI / campaign effectiveness metrics
- A/B testing framework for content
- Engagement rate trend analysis per release

### C.5 Press Kit (MISSING)

No press kit functionality exists. No types, no UI, no generation.

### C.6 Distribution Abstraction (MISSING)

What exists:
- Social publishing (Meta/Instagram/Facebook via Graph API)
- Catalog sync (SoundCloud, Spotify)
- Export pack (manual file export with caption.txt + media)

What is missing:
- A `DistributionProvider` interface
- Music distribution service integration (DistroKid, TuneCore, CD Baby, etc.)
- Distribution-specific metadata (ISRC, UPC, catalog number)
- Distribution status tracking

### C.7 Frontend Decomposition (CRITICAL GAP)

`App.tsx` is a 754-line monolith containing ALL views, ALL state (80+ useState hooks), and ALL business functions. Only 3 components are extracted:
- `AudioPlayer`
- `ConversationWorkspace`
- `HarnessPlanPreview`

This must be decomposed before the release workflow can be extended.

### C.8 Multi-Artist Generalization (GAP)

`ArtistAlias` is a union literal of 4 fixed values:
```typescript
type ArtistAlias = "the-arkadiusz" | "arkadelic" | "ar-tek" | "echoes-of-arcadia";
```

Adding artists requires code changes and TypeScript recompilation. For a generalizable system, this needs to become a dynamic database-driven lookup.

---

## D. DOMAIN MODEL RECOMMENDATION

### Minimum Domain Extension for Release Promotion Workflow

These are **recommendations only** — not implemented.

#### D.1 ReleaseCreativeProfile (extends existing Release)

New table: `release_creative_profiles`

```sql
CREATE TABLE release_creative_profiles (
  release_id TEXT PRIMARY KEY REFERENCES releases(id) ON DELETE CASCADE,
  visual_direction TEXT NOT NULL DEFAULT '',
  color_palette TEXT NOT NULL DEFAULT '',
  typography TEXT NOT NULL DEFAULT '',
  mood TEXT NOT NULL DEFAULT '',
  target_audience TEXT NOT NULL DEFAULT '',
  key_messages_json TEXT NOT NULL DEFAULT '[]',
  competitor_references TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
```

**Rationale:** Extends existing Release with creative direction. Currently this data is scattered across `brand_profiles` (artist-level) and inline prompts. This centralizes per-release creative context.

#### D.2 ReleasePlan (NEW entity)

New table: `release_plans`

```sql
CREATE TABLE release_plans (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','in_review','approved','rejected','archived')),
  title TEXT NOT NULL,
  strategy_summary TEXT NOT NULL DEFAULT '',
  timeline_json TEXT NOT NULL DEFAULT '{}',
  target_channels_json TEXT NOT NULL DEFAULT '[]',
  budget_notes TEXT NOT NULL DEFAULT '',
  kpi_goals_json TEXT NOT NULL DEFAULT '{}',
  model TEXT,
  generated_at TEXT,
  approved_at TEXT,
  approved_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**Rationale:** The user-facing term is "Release Plan". This is the central structured artifact that orchestrates the entire promotion workflow. It stores strategy, timeline, targets, and approval state. Generation is optional (can be manually created or AI-generated).

#### D.3 CampaignItem (extends existing campaign_pack_items)

The existing `campaign_pack_items` table is close but needs:

```sql
ALTER TABLE campaign_pack_items ADD COLUMN plan_id TEXT REFERENCES release_plans(id) ON DELETE SET NULL;
ALTER TABLE campaign_pack_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaign_pack_items ADD COLUMN notes TEXT NOT NULL DEFAULT '';
```

**Rationale:** Links generated content back to the plan. The existing table structure is sound; this adds plan association and ordering.

#### D.4 GeneratedAsset (extends existing media_generations)

The existing `media_generations` table already functions as a `GeneratedAsset` table. Recommend renaming the TypeScript type rather than creating a new table:

```typescript
// Rename in contracts.ts:
type GeneratedAsset = MediaGenerationSummary; // alias for clarity
```

**Rationale:** `media_generations` already stores: provider, mediaType, prompt, status, providerTaskId, localPath, metadata. This IS the generated asset record.

#### D.5 GeneratedTextContent (extends existing drafts + campaign_pack_items)

The existing `drafts` and `campaign_pack_items` tables store generated text. Recommend a unified view:

```sql
CREATE VIEW generated_text_content AS
  SELECT id, release_id, NULL AS plan_id, channel, language, content, status, model_name,
         'draft' AS source, created_at, updated_at
  FROM drafts
  UNION ALL
  SELECT id, release_id, NULL AS plan_id, channel, language, content, status, model_name,
         'pack_item' AS source, created_at, updated_at
  FROM campaign_pack_items;
```

**Rationale:** Two separate tables store generated text (drafts for per-channel, pack_items for structured content). A view unifies them without migration.

#### D.6 ApprovalRecord (NEW entity)

New table: `approval_records`

```sql
CREATE TABLE approval_records (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('approved','rejected','revision_requested')),
  reviewer TEXT NOT NULL DEFAULT 'user',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_approval_records_entity ON approval_records(entity_type, entity_id, created_at);
```

**Rationale:** Currently each entity has its own inline status transitions but no audit trail of WHO approved and WHY. This provides a universal approval audit log.

#### D.7 ScheduleEvent (NEW entity)

New table: `schedule_events`

```sql
CREATE TABLE schedule_events (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  plan_id TEXT REFERENCES release_plans(id) ON DELETE SET NULL,
  campaign_pack_item_id TEXT REFERENCES campaign_pack_items(id) ON DELETE SET NULL,
  media_generation_id TEXT REFERENCES media_generations(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK(platform IN ('Instagram','Facebook','TikTok','SoundCloud','YouTube')),
  scheduled_at TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','scheduled','published','failed','cancelled')),
  published_at TEXT,
  remote_post_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_schedule_events_release ON schedule_events(release_id, scheduled_at);
CREATE INDEX idx_schedule_events_platform ON schedule_events(platform, scheduled_at);
```

**Rationale:** The existing `publishing_queue` serves a similar purpose but is tightly coupled to the export/publish flow. `ScheduleEvent` represents the planning layer ("what goes where and when") separate from execution.

#### D.8 PublicationJob (extends existing publishing_queue)

The existing `publishing_queue` already functions as a `PublicationJob`. Recommend aliasing:

```typescript
type PublicationJob = PublishingQueueItem; // alias for clarity
```

**Rationale:** `publishing_queue` already tracks: platform, caption, scheduledAt, status, error, exportedAt, remotePostId, publishedAt, destinationId. This IS the publication job.

#### D.9 Deliverable (NEW entity)

New table: `deliverables`

```sql
CREATE TABLE deliverables (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN (
    'press-release','press-kit','bio','one-sheet','rider',
    'social-template','email-template','newsletter',
    'export-pack','custom'
  )),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  file_path TEXT,
  mime_type TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','generating','ready','approved','rejected')),
  model TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_deliverables_release ON deliverables(release_id, kind);
```

**Rationale:** The future workflow requires generating various deliverables (press kits, bios, one-sheets, templates) that are neither pure text content nor media assets. This provides a flexible container.

### D.10 Entity Relationship Summary

```
Release
  ├── ReleaseCreativeProfile (1:1, extends release with creative context)
  ├── ReleasePlan (1:N, structured promotion plans)
  │     └── CampaignItem (N:1, content items linked to plan)
  ├── GeneratedAsset (1:N, media_generations — already exists)
  ├── GeneratedTextContent (1:N, drafts + campaign_pack_items — already exists)
  ├── ApprovalRecord (1:N, universal approval audit)
  ├── ScheduleEvent (1:N, planned publish times)
  │     └── PublicationJob (1:1, actual publish execution — publishing_queue already exists)
  └── Deliverable (1:N, press kits, templates, exports)
```

---

## E. PERSISTENCE IMPACT

### Tables Requiring New Migrations

| Entity | New/Extend | Migration Effort |
|---|---|---|
| `release_creative_profiles` | NEW | Low — simple key-value extension of release |
| `release_plans` | NEW | Medium — core new entity, needs CRUD + status transitions |
| `campaign_pack_items` (add plan_id) | EXTEND | Low — nullable FK + sort_order + notes columns |
| `approval_records` | NEW | Low — append-only audit log |
| `schedule_events` | NEW | Medium — scheduling logic + platform constraints |
| `deliverables` | NEW | Medium — flexible content container |

### Tables Already Sufficient (alias only)

| Entity | Existing Table | Notes |
|---|---|---|
| `GeneratedAsset` | `media_generations` | Rename TypeScript type only |
| `GeneratedTextContent` | `drafts` + `campaign_pack_items` | Create unified view |
| `PublicationJob` | `publishing_queue` | Rename TypeScript type only |

### Database Method Additions

New methods needed in `StudioDatabase` (file: `electron/main/database/database.ts`):

- `createReleasePlan()` / `updateReleasePlan()` / `listReleasePlans()`
- `createApprovalRecord()` / `listApprovalRecords()`
- `createScheduleEvent()` / `updateScheduleEvent()` / `listScheduleEvents()`
- `createDeliverable()` / `updateDeliverable()` / `listDeliverables()`
- `createReleaseCreativeProfile()` / `updateReleaseCreativeProfile()`

### Estimated Migration Count

**6 new migrations** (v20-v25) would be needed. Each follows the existing `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` pattern.

---

## F. IPC/API IMPACT

### New IPC Channels Needed

| Channel | Method | Purpose |
|---|---|---|
| `studio:create-release-plan` | POST | Create a new release plan |
| `studio:update-release-plan` | PUT | Update plan content/status |
| `studio:list-release-plans` | GET | List plans for a release |
| `studio:generate-release-plan` | POST | AI-generate a plan from release context |
| `studio:approve-release-plan` | POST | Approve/reject a plan |
| `studio:create-approval-record` | POST | Record an approval action |
| `studio:list-approval-records` | GET | List approval history for entity |
| `studio:create-schedule-event` | POST | Schedule a publish event |
| `studio:update-schedule-event` | PUT | Update schedule status |
| `studio:list-schedule-events` | GET | List events for a release |
| `studio:create-deliverable` | POST | Create a deliverable |
| `studio:generate-deliverable` | POST | AI-generate a deliverable |
| `studio:update-deliverable` | PUT | Update deliverable content/status |
| `studio:list-deliverables` | GET | List deliverables for a release |
| `studio:save-release-creative-profile` | POST | Save creative profile |
| `studio:get-release-creative-profile` | GET | Get creative profile |

### Extension to StudioApi Interface

Add ~16 new methods to `electron/shared/contracts.ts` (lines 427-513). The `StudioApi` interface will grow from 94 to ~110 methods.

### Extension to Preload Bridge

Add ~16 new method mappings to `electron/preload/index.cts`. Each follows the existing pattern:
```typescript
newMethod: (input) => ipcRenderer.invoke("studio:new-method", input),
```

---

## G. FRONTEND IMPACT

### Screens to Extend (NOT Replace)

| Current Screen | File:Line | Extension Needed |
|---|---|---|
| **Releases** | `App.tsx:679-748` | Add Release Plan tab/section within release detail view |
| **Tasks & Calendar** | `App.tsx:623-631` | Extend with schedule visualization, publish calendar |
| **AI Studio** | `App.tsx:608` | Add plan generation alongside existing conversation workspace |
| **Analytics** | `App.tsx:610-618` | Add post-publish analytics, campaign effectiveness |
| **Settings** | `App.tsx:632-633` | Add approval workflow configuration |

### Screens That May Need New Sub-Views

| New Sub-View | Parent Screen | Purpose |
|---|---|---|
| Release Plan Editor | Releases | Strategy, timeline, channel targets |
| Content Calendar | Tasks & Calendar | Visual schedule of all planned content |
| Deliverables Panel | Releases | Press kit, bio, one-sheet generation |
| Approval Dashboard | Overview or dedicated | Pending approvals across all releases |

### Recommended Component Extractions

Before extending, these should be extracted from `App.tsx`:

1. `ReleaseDetailView` (release detail + tabs)
2. `ReleasePlanEditor` (new)
3. `ContentCalendar` (extends Tasks & Calendar)
4. `PublishingCalendar` (extends Tasks & Calendar)
5. `ApprovalPanel` (new)
6. `DeliverablesPanel` (new)
7. `AnalyticsDashboard` (extract from monolithic Analytics section)

---

## H. RISKS

### H.1 Duplicate Models

**Risk Level: MEDIUM**

- `ArtistAlias` is hardcoded as a union literal. Adding artists requires TypeScript recompilation.
- `src/data/artists.ts` duplicates seed data from `database.ts` — these can drift.
- `DraftStatus` is used for both `drafts` table and `campaign_pack_items` table — semantic confusion (draft means "generated text" not "draft status").

**Recommendation:** Make `ArtistAlias` dynamic (database-driven). Remove `src/data/artists.ts` and always query from DB.

### H.2 Architectural Coupling

**Risk Level: HIGH**

- `App.tsx` (754 lines) contains ALL business logic. Every new feature adds to this monolith.
- No state management library — 80+ useState hooks with manual coordination.
- No component decomposition — adding a Release Plan tab means adding more inline JSX to App.tsx.
- The `StudioApi` interface in `contracts.ts` grows linearly with features (currently 94 methods, will exceed 110).

**Recommendation:** Extract feature modules before adding Release Plan workflow. Target: no file exceeds 300 lines.

### H.3 Mock/Demo Dependencies

**Risk Level: LOW**

- No demo mode exists. All data is real.
- Only mock data: 4 hardcoded artist profiles (seed data), one fallback template string.
- Legacy prototype is fully isolated in `legacy-prototype/` directory.
- Smoke test in HarnessPlanPreview writes only to `.runtime/` (gitignored).

**No action needed.** The codebase is clean of demo contamination.

### H.4 Migration Risks

**Risk Level: MEDIUM**

- 19 migrations already exist. Schema is mature.
- Migration v15 demonstrates table rebuild pattern (create v2, copy, drop, rename) — this is the precedent for complex schema changes.
- All migrations use `PRAGMA user_version` — no external migration tool.
- Foreign key cascades are aggressive — deleting a project cascades through releases, campaigns, assets, etc.

**Recommendation:** New migrations should be additive only (new tables, new nullable columns). Avoid rebuilds.

### H.5 Provider Coupling

**Risk Level: MEDIUM**

- AI harness depends on external `../../Local AI/ai-harness/orchestrator` directory — not in this repo.
- Provider router compiles external TypeScript at runtime — fragile.
- `AI_HARNESS_ROOT` env var controls path — must be set correctly.
- Only `file.transform` executor is implemented in the harness — all other capabilities return `NO_EXECUTOR`.

**Recommendation:** The harness provider system should remain optional. New Release Plan generation should fall back to direct Ollama calls if harness is unavailable.

### H.6 State Management Risks

**Risk Level: HIGH**

- 80+ useState hooks in a single component — no computed state, no derived state, no state machines.
- Data fetched in useEffect with no caching — every view switch re-fetches from database.
- No optimistic updates — all mutations wait for IPC round-trip.
- No error boundaries — a failing IPC call can crash the entire UI.

**Recommendation:** Introduce at minimum a simple state container (Zustand or React Context) for release-related state before adding workflow complexity.

### H.7 Concurrency Risks

**Risk Level: LOW**

- SQLite WAL mode with 5-second busy timeout handles concurrent reads.
- All writes use `BEGIN IMMEDIATE` transactions.
- No background job queue — async operations (media generation) are polled on demand.
- Single-instance lock prevents duplicate app instances.

**No immediate action needed.** But a background job system will be needed for scheduled publishing.

### H.8 Unpinned Dependencies

**Risk Level: LOW-MEDIUM**

- `package.json` uses `"latest"` for Electron version. No pinned versions for core deps.
- This means builds are not reproducible across time.

**Recommendation:** Pin critical dependencies before release.

---

## I. RECOMMENDED PHASE 1

### Goal

Create the minimal foundation that enables the Release Promotion Workflow without disrupting existing functionality.

### Scope: Release Plan Persistence + Basic UI

#### I.1 Database (1 migration)

**Migration v20: `release_plan_v1`**

Create the `release_plans` table and `approval_records` table. Add `plan_id` FK to `campaign_pack_items`.

This is purely additive — no existing tables are modified in a breaking way.

#### I.2 TypeScript Types

Add to `electron/shared/contracts.ts`:
- `ReleasePlan` interface
- `ReleasePlanStatus` type
- `CreateReleasePlanInput` / `UpdateReleasePlanInput`
- `ApprovalRecord` interface
- `ApprovalAction` type
- Extension of `StudioApi` with ~8 new methods

#### I.3 Database Methods

Add to `electron/main/database/database.ts`:
- `createReleasePlan()`
- `updateReleasePlan()`
- `listReleasePlans(releaseId)`
- `getReleasePlan(planId)`
- `createApprovalRecord()`
- `listApprovalRecords(entityType, entityId)`

#### I.4 IPC Handlers

Add to `electron/main/index.ts`:
- `studio:create-release-plan`
- `studio:update-release-plan`
- `studio:list-release-plans`
- `studio:get-release-plan`
- `studio:create-approval-record`
- `studio:list-approval-records`

#### I.5 Preload Bridge

Add to `electron/preload/index.cts`:
- 6 new method mappings

#### I.6 Frontend

Add a new tab/section within the Releases view in `App.tsx`:
- Release Plan list (per release)
- Basic plan editor (title, strategy summary, target channels, timeline notes)
- Plan status transitions (draft→in_review→approved→rejected)

This is intentionally minimal — just enough to validate the data model works end-to-end.

### What Phase 1 Does NOT Include

- AI-generated plans (deferred to Phase 2)
- Content calendar visualization (Phase 2)
- Approval workflow automation (Phase 2)
- Schedule events (Phase 2)
- Deliverables (Phase 3)
- Press kit generation (Phase 3)
- Analytics dashboard extension (Phase 3)
- App.tsx decomposition (should happen in parallel but is separate work)

### Testing Strategy

1. Unit test new database methods (follow `database.test.ts` pattern)
2. Verify migration runs cleanly on existing database (v1→v20)
3. Verify existing release CRUD still works after migration
4. Manual smoke test: create release → create plan → update plan → approve plan
5. Verify no regression in existing campaign pack generation

### Estimated Effort

- **Database + Types:** ~2 hours
- **IPC + Preload:** ~1 hour
- **Frontend (basic):** ~3 hours
- **Tests:** ~2 hours
- **Total:** ~8 hours

This is small enough to implement and test independently while providing the foundation for all subsequent workflow phases.

---

*End of Phase 0 Audit. Do not begin implementation until explicitly instructed.*

---

## PHASE 3A: APPROVED Release Plan → Promo Content Generation

**Date:** 2026-09-15
**Status:** COMPLETE

### 3A.1 Architecture Decision

| Question | Decision |
|---|---|
| Separate engine or reuse existing? | **Reuse existing** — `generateCampaignDraft` + `saveCampaignPackItems` |
| Storage model | New `promo_generations` table (migration v22) linked to campaign items |
| Duplicate prevention | UNIQUE index on `campaign_item_id` — one generation per campaign item |
| Execution trigger | Single explicit user action ("Generate Promo Content" button) |
| Failure isolation | Per-item SUCCESS/FAILED/SKIPPED — one failure does not corrupt others |
| Retry mechanism | `retryPromoGeneration` replaces existing `promo_generations` row |

### 3A.2 Files Changed/Created

| File | Change |
|---|---|
| `electron/shared/contracts.ts` | +PromoGeneration, +PromoGenerationStatus, +GeneratePromoContentInput, +PromoGenerationResult, +PromoGenerationItemResult, +3 StudioApi methods |
| `electron/main/database/migrations.ts` | v22: `promo_generations` table with UNIQUE on `campaign_item_id` |
| `electron/main/database/database.ts` | +listPromoGenerations, +getPromoGenerationByCampaignItem, +insertPromoGeneration |
| `electron/main/promo-generation.ts` | **NEW** — generation engine module |
| `electron/main/index.ts` | +3 IPC handlers (generate-promo-content, list-promo-generations, retry-promo-generation) |
| `electron/preload/index.cts` | +3 bridge methods |
| `src/features/release-plan/ReleasePlanPanel.tsx` | +Generate Promo Content button, +promo result display, +promo list display |
| `src/features/release-plan/release-plan.css` | +promo result/list/status CSS |
| `electron/main/database/database.test.ts` | schema version 21→22 |
| `electron/main/database/release-plan-domain.test.ts` | schema version 21→22 |
| `electron/main/promo-generation.test.ts` | **NEW** — 6 backend tests |
| `src/features/release-plan/__tests__/test-helpers.ts` | +listPromoGenerations, +generatePromoContent, +retryPromoGeneration mocks |
| `src/features/release-plan/__tests__/ReleasePlanPanel.test.tsx` | +4 frontend tests |
| `package.json` | +promo-generation.test.js to test script |

### 3A.3 Test Results

| Suite | Count | Pass | Fail |
|---|---|---|---|
| Backend (`npm run test`) | 142 | 141 | 0 (1 skipped — symlink on Windows) |
| Frontend (`npm run test:frontend`) | 47 | 47 | 0 |
| TypeScript (`npm run typecheck`) | — | PASS | — |
| Build (`npm run build`) | — | PASS | — |

### 3A.4 State Flow

```
APPROVED Release Plan
    → User clicks "Generate Promo Content"
    → System iterates CampaignItems
    → For each item:
        - If already generated → reuse existing (SKIPPED)
        - If unsupported content type → SKIPPED
        - If generable → call generateCampaignDraft (Ollama)
        - On success → insertPromoGeneration(SUCCESS) + saveCampaignPackItems
        - On failure → insertPromoGeneration(FAILED) with error message
    → Return PromoGenerationResult summary
```

### 3A.5 Content Type Support

| Content Type | Generation Method |
|---|---|
| caption | `generateCampaignDraft` (Ollama) |
| video-hook | `generateCampaignDraft` (Ollama) |
| video-script | `generateCampaignDraft` (Ollama) |
| image-prompt | `generateCampaignDraft` (Ollama) |
| visualizer-prompt | `generateCampaignDraft` (Ollama) |
| story | SKIPPED (not generable) |
| email | SKIPPED (not generable) |
| other | SKIPPED (not generable) |
