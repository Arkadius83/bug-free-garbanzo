# AI Studio Manager — source of truth

Status: binding until explicitly superseded.

## Runtime boundaries

- Electron + React + TypeScript is the desktop application.
- SQLite is owned exclusively by the Electron main process.
- Renderer access is only through typed preload IPC. React never opens the database directly.
- Python will be a replaceable worker behind versioned JSON contracts; Python types must not leak into UI contracts.
- FFmpeg will perform media conversion and rendering.
- C++ is not part of the architecture unless measured performance later proves it necessary.

## SQLite schema V1

Core flow: `ArtistProfile → Project → Track → Release → Campaign → Draft`.

Supporting entities: Asset, ReleaseTrack, CampaignAsset, Task, Event and Setting.

- IDs are stable UUIDs, except append-only Event sequence IDs.
- Events are append-only operational history.
- Large media stays on disk; SQLite stores paths and metadata.
- Schema changes use ordered migrations and `PRAGMA user_version`.
- A clean installation must create and migrate its database without manual steps.
- Database tests always use isolated temporary directories and remove them afterward.

## Publishing rule

Generated content remains a draft until explicitly approved. No platform adapter may publish autonomously in the MVP.

## Ollama V1

- Ollama is accessed only by the Electron main process at `127.0.0.1:11434`.
- The renderer receives model metadata and generated text through typed IPC.
- Selected model, language and channel are persisted in SQLite settings.
- On first launch, an installed `deepseek-r1` variant is preferred as the default model; the user can override it.
- Generation receives only explicit release fields; it has no filesystem, shell or publishing access.
- Marketing generation disables reasoning mode and caps output length; DeepSeek R1 remains the selected language model without spending the response budget on chain-of-thought.
- Generated copy is always a preview and requires human approval.
