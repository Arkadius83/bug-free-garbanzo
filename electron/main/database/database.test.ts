import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { StudioDatabase } from "./database.js";

test("creates a clean database, applies migrations and persists a release", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-manager-db-"));
  const filePath = path.join(directory, "studio.sqlite");
  const database = new StudioDatabase(filePath);
  try {
    database.initialize();
    assert.equal(database.health().schemaVersion, 1);
    assert.deepEqual(database.listReleases(), []);
    const created = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Different Perspective", primaryGenre: "Full-On Psytrance", story: "A shift beyond ego." });
    assert.equal(created.status, "draft");
    assert.equal(database.listReleases()[0]?.title, "Different Perspective");
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
