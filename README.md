# AI Studio Manager

Local-first Electron desktop workspace for managing SONIC-ARK releases, AI-assisted promotion, media generation, catalog integrations and publishing workflows.

## Current stage

The project is an early functional MVP and has moved well beyond the original 0.1.0 foundation milestone.

Implemented areas include:

- release and artist workflows backed by SQLite
- media attachment, playback and audio analysis
- Ollama-powered campaign drafting and AI task support
- SoundCloud authentication, catalog sync and performance data
- Spotify authentication, artist mapping and catalog sync
- campaign packs and human approval workflows
- OpenAI, Kling and local ComfyUI media generation
- local Ollama / ComfyUI service management
- publishing queue and publishing-pack export
- Meta authentication and Facebook / Instagram publishing path
- Cloudflare R2 media bridge
- analytics, brand profiles and lightweight CRM / contacts

See [`docs/STATUS.md`](docs/STATUS.md) for the current implementation audit, engineering debt and stabilization roadmap.

## Architecture

```text
React renderer
  -> typed preload bridge
  -> Electron IPC
  -> Electron main process
      -> SQLite
      -> Ollama
      -> SoundCloud / Spotify / Meta
      -> OpenAI / Kling / ComfyUI
      -> Cloudflare R2
      -> local filesystem
```

The renderer has no direct Node.js or SQLite access. Electron owns persistence, filesystem operations, credentials and external-service adapters.

The original static prototype remains preserved in `legacy-prototype/`.

More architecture detail is available in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Development

Requirements:

- Node.js 22+
- npm
- Windows for full desktop/runtime smoke testing

Install and run:

```bash
npm ci
npm run dev
```

Verification:

```bash
npm run typecheck
npm test
npm run build
```

GitHub Actions runs the same typecheck, test and build verification for stabilization changes.

## Product rule

Generated content must remain human-controlled. Drafts and generated media require explicit review/approval before publishing actions. Platform and rights restrictions are enforced at the application boundary where implemented.

## Immediate engineering priority

The next milestone is stabilization and productization rather than adding broad new feature surface:

1. keep typecheck/tests/build green
2. validate a complete release-to-publishing vertical workflow
3. split the oversized renderer `App.tsx` into feature modules
4. expand integration test coverage
5. pin dependency versions after verification
6. refresh remaining architecture documentation

## Harness

The Harness integration turns an AI Manager goal into an ordered plan, readiness report, explicit execution review, approval, result and durable audit summary. V12 planning stays behind the AI Manager adapter; the renderer talks only through the typed preload IPC surface.

Current executable scope is intentionally narrow: only `file.transform` through `local.text-file-transform.v1` can write text files, and only inside `.runtime/harness-smoke-test/`. Image, audio, voice, repository and other capabilities may appear in plans but do not execute here.

Launch the desktop app with:

```bash
npm run dev
```

Smoke test flow:

1. Open Harness Plan Preview.
2. Click `Load smoke test plan`.
3. Confirm the selected READY `SMOKE_FILE_TRANSFORM` task.
4. Click `Create execution review` and inspect the target, before hash, expected after hash and diff.
5. Type the shown `CONFIRM:<planId>` phrase.
6. Click `Execute approved tasks`.
7. Verify `.runtime/harness-smoke-test/harness-smoke-test.txt` changed and the Audit History panel shows the result.

Approval metadata and audit summaries are main-process owned. Approvals are short-lived and single-use. Audit data is stored outside `localStorage` under Electron `userData` in `harness-governance/audit.jsonl`; it stores hashes, status and paths, not full file contents. Runtime smoke files under `.runtime/` are ignored by Git.
