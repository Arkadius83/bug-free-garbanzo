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
    const draft = database.saveGeneratedDraft({ releaseId: created.id, channel: "Instagram", language: "en", content: "A generated campaign draft.", model: "deepseek-r1:14b" });
    assert.equal(database.listDrafts(created.id)[0]?.content, "A generated campaign draft.");
    assert.equal(database.updateDraftStatus(draft.id, "approved").status, "approved");
    assert.equal(database.updateDraftStatus(draft.id, "scheduled").status, "scheduled");
    assert.equal(database.updateDraftStatus(draft.id, "published").status, "published");
    assert.throws(() => database.updateDraftStatus(draft.id, "draft"), /Invalid draft transition/);
    database.setSetting("ai", { model: "small-model", language: "en" });
    assert.deepEqual(database.getSetting("ai", null), { model: "small-model", language: "en" });
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
