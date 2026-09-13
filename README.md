# AI Studio Manager

Local-first desktop workspace for turning SONIC-ARK tracks into coordinated promotional campaigns.

## Architecture

- Electron main process: filesystem, future SQLite storage, external services and job orchestration.
- Secure preload: narrow, typed IPC contract. The renderer has no direct Node.js access.
- React + TypeScript renderer: artist, release, campaign and approval workflows.
- Ollama adapter: discovers locally installed models through `127.0.0.1:11434`.
- Future Python worker: isolated audio/AI jobs communicating through versioned JSON contracts.
- FFmpeg: future audio/video rendering and transcoding.

The original static prototype is preserved in `legacy-prototype/`.

## Development

Requirements: Node.js 22+ and npm.

```bash
npm install
npm run dev
```

Verification:

```bash
npm run typecheck
npm run build
```

## Milestone 0.1.0

- Electron + React + TypeScript foundation
- isolated renderer and secure preload bridge
- four artist profiles
- read-only Ollama model discovery
- legacy prototype preserved

No publishing integrations or autonomous actions are included in this milestone.
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
