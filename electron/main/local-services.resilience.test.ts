import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LocalServicesManager } from "./local-services.js";

test("local service status stays usable when Ollama and ComfyUI are offline", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-local-services-"));
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new TypeError("connection refused"); }) as typeof fetch;
  try {
    const manager = new LocalServicesManager(directory);
    const status = await manager.status();
    assert.equal(status.ollama.running, false);
    assert.equal(status.comfyUi.running, false);
    assert.equal(typeof status.autoStart, "boolean");
  } finally {
    globalThis.fetch = original;
    rmSync(directory, { recursive: true, force: true });
  }
});
