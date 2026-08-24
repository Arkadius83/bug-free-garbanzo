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
