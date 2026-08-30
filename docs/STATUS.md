# AI Studio Manager — Current Project Status

Status date: 2026-08-30

This document reflects the implemented repository state and supersedes milestone descriptions in older documentation when they conflict with the code.

## Product stage

AI Studio Manager is beyond the original 0.1.0 foundation milestone. The repository currently represents an early functional MVP with real desktop persistence, local AI, catalog integrations, media generation, publishing preparation, analytics, and CRM capabilities.

## Runtime architecture

```text
React renderer
  -> typed window.studio API
  -> Electron preload
  -> IPC
  -> Electron main process
      -> SQLite persistence
      -> Ollama
      -> SoundCloud
      -> Spotify
      -> Meta
      -> OpenAI Images
      -> Kling
      -> ComfyUI
      -> Cloudflare R2 media bridge
      -> local filesystem
```

Security boundaries remain intentional: renderer code does not receive direct Node.js or SQLite access; Electron runs with context isolation, disabled node integration, and sandboxing.

## Implemented product areas

### Core release workflow
- Artist profiles
- Release creation, update and deletion
- Persistent SQLite storage and ordered migrations
- Release readiness
- Media attachment and playback
- Audio analysis
- Draft creation, approval and rejection workflow
- Tasks and AI-assigned task execution

### AI and content
- Ollama model discovery and local generation
- Campaign draft generation
- Campaign pack generation and persistence
- Human approval gates
- Brand profiles

### Catalog integrations
- SoundCloud authentication and catalog sync
- SoundCloud catalog metadata, content classification and performance data
- Spotify authentication
- Spotify artist mappings and catalog sync
- Internal catalog matching/linking

### Media generation
- OpenAI image generation
- Kling image/video task generation
- Local ComfyUI image generation
- Local ComfyUI checkpoint discovery and workflow submission
- Generated-media persistence and review state
- Local service management for Ollama and ComfyUI

### Publishing
- Publishing queue
- Approval/scheduling status flow
- Exportable publishing packs
- Rights-aware export blocking
- Meta authentication and Facebook/Instagram publishing path
- Cloudflare R2 media bridge

### Operations
- Analytics view based on stored catalog/release data
- Contacts / lightweight CRM
- Contact interactions and follow-up support

## Known engineering debt

### 1. Renderer monolith
`src/App.tsx` has grown into a very large feature container. Further product work should be preceded by feature extraction into smaller components/hooks/modules without changing behavior.

Suggested target structure:

```text
src/
  features/
    releases/
    ai-studio/
    tasks/
    analytics/
    contacts/
    integrations/
    publishing/
    media/
  components/
  hooks/
  data/
```

### 2. Test coverage lags product scope
Automated tests currently focus mainly on database behavior and audio analysis. High-value integration tests are still needed for SoundCloud, Spotify, media generation, publishing queue transitions, Meta publishing preparation, and IPC contracts.

### 3. Documentation drift
Older README/milestone text understates the implemented functionality. Code and this status document should be treated as the current reference until architecture documentation is refreshed completely.

### 4. Dependency policy
The manifest currently uses `latest` ranges for major dependencies. The existing lockfile makes current installs reproducible with `npm ci`, but explicit version ranges should be pinned in a controlled dependency-stabilization change after verification.

## Stabilization plan

### Phase 2A — verification
1. Run `npm ci`.
2. Run `npm run typecheck`.
3. Run `npm test`.
4. Run `npm run build`.
5. Run the Windows desktop app and perform a smoke test of startup, database migration, media playback and local-service detection.

### Phase 2B — structural cleanup
1. Extract `App.tsx` into feature modules while preserving behavior.
2. Add integration tests around IPC and external-service adapters.
3. Pin dependency versions based on a verified lockfile.
4. Refresh architecture and developer documentation.

### Phase 2C — vertical MVP validation
Validate one complete real release flow:

```text
Track
 -> Release metadata
 -> Audio attachment and analysis
 -> Campaign content
 -> Artwork/media generation
 -> Human approval
 -> Publishing queue
 -> Meta/export publishing path
 -> Analytics
```

A release that completes this path without manual code/database intervention is the product-level MVP acceptance criterion.

## CI

The `phase-2-stabilization` branch introduces GitHub Actions verification for:
- typecheck
- automated tests
- production build

Windows-specific Electron runtime behavior still requires local Windows smoke testing.
