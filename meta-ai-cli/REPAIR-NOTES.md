# Frontend image generation

Image creation uses the existing Playwright storage state and Meta's frontend,
not the obsolete GraphQL sendMessageStream transport. It does not publish posts.

The previous generic parser failure masked a real browser timeout: Send was
located by visible text, although the actual button exposed an accessible name.
Playwright CLI returned `### Error` with process exit code zero. Both cases are
now handled explicitly. Code is passed with `run-code --filename`, not through
a large Windows command-line argument. Temporary code files are removed.

## Usage

```powershell
deno run -A cli.ts --json image create --prompt "simple red sphere on dark background" --image-out "E:/AI World/Meta AI Test/repair-test/" --aspect 1:1 --count 1
```

An existing directory or trailing separator means directory output. Other
paths retain numbered filename-prefix behavior. Image extensions follow the
verified binary format; filenames do not overwrite existing outputs.

- Count: 1 through 4, generated sequentially in one browser session.
- Aspect: 1:1, 16:9, 9:16. The request specifies the ratio; loaded image dimensions
  must match within a small tolerance or the command fails explicitly.
- UI readiness: 30 seconds; Send: 15 seconds; generation: 5 minutes per image;
  process deadline: 6 minutes per image; download: 60 seconds, at most 32 MB.
- An expired session, changed frontend, refusal or provider limit is an error,
  not a fabricated success. Reconnect using the existing login command if needed.
- The JSON success/error envelope remains unchanged. No session cookies are logged.
- Video/history flows are not part of this repair and have not been live-tested.

## Checks

```powershell
deno check cli.ts
deno test -A lib
deno run -A scripts/test-playwright-transport.ts
```

The last test needs installed Playwright CLI and Chrome, but no Meta account:
it runs on about:blank and checks a large Unicode/quoted payload and browser errors.
