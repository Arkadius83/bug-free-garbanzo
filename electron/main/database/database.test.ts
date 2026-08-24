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
    assert.equal(database.health().schemaVersion, 4);
    assert.deepEqual(database.listReleases(), []);
    const created = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Different Perspective", primaryGenre: "Full-On Psytrance", story: "A shift beyond ego." });
    assert.equal(created.status, "draft");
    const edited = database.updateRelease({ id: created.id, artistId: "the-arkadiusz", title: "Different Perspective V2", primaryGenre: "Psytrance", story: "Updated story.", releaseDate: "2026-09-11", status: "planned" });
    assert.equal(edited.title, "Different Perspective V2");
    assert.equal(edited.releaseDate, "2026-09-11");
    assert.equal(edited.status, "planned");
    assert.equal(database.listReleases()[0]?.title, "Different Perspective V2");
    const draft = database.saveGeneratedDraft({ releaseId: created.id, channel: "Instagram", language: "en", content: "A generated campaign draft.", model: "deepseek-r1:14b" });
    assert.equal(database.listDrafts(created.id)[0]?.content, "A generated campaign draft.");
    assert.equal(database.updateDraftStatus(draft.id, "approved").status, "approved");
    assert.equal(database.updateDraftStatus(draft.id, "scheduled").status, "scheduled");
    assert.equal(database.updateDraftStatus(draft.id, "published").status, "published");
    assert.throws(() => database.updateDraftStatus(draft.id, "draft"), /Invalid draft transition/);
    const asset = database.attachAsset({ releaseId: created.id, kind: "audio", filePath: path.join(directory, "track.wav"), fileName: "track.wav", mimeType: "audio/wav", sizeBytes: 1234, modifiedAt: "2026-08-24T10:00:00.000Z", width: null, height: null });
    assert.equal(database.listAssets(created.id)[0]?.id, asset.id);
    assert.equal(database.listAssets(created.id)[0]?.sizeBytes, 1234);
    const analysis = database.saveAudioAnalysis({
      id: "analysis-1", assetId: asset.id, status: "complete", analyzer: "ffmpeg-ebur128",
      format: "pcm_s24le", durationSeconds: 360, sampleRate: 48000, channels: 2,
      bitDepth: 24, integratedLufs: -9.2, loudnessRangeLu: 4.1, truePeakDbtp: -0.8,
      bpm: 150, bpmConfidence: 91, alternateBpm: 75,
      musicalKey: "F♯ minor", keyConfidence: 78, alternateKey: "A major",
      analyzedAt: "2026-08-24T12:00:00.000Z", note: null
    });
    assert.equal(database.getAudioAnalysis(asset.id)?.id, analysis.id);
    assert.equal(database.getAudioAnalysis(asset.id)?.integratedLufs, -9.2);
    assert.equal(database.getAudioAnalysis(asset.id)?.bpm, 150);
    assert.equal(database.getAudioAnalysis(asset.id)?.musicalKey, "F♯ minor");
    const readiness = database.getReleaseReadiness(created.id);
    assert.equal(readiness.score, 85);
    assert.equal(readiness.checks.find((check) => check.id === "audio")?.complete, true);
    assert.equal(readiness.checks.find((check) => check.id === "cover")?.complete, false);
    assert.ok(readiness.missing.includes("Attach release artwork"));
    const cover = database.attachAsset({ releaseId: created.id, kind: "cover", filePath: path.join(directory, "cover.png"), fileName: "cover.png", mimeType: "image/png", sizeBytes: 4321, modifiedAt: null, width: 3000, height: 3000 });
    assert.equal(database.getReleaseReadiness(created.id).score, 100);
    database.detachAsset(cover.id);
    assert.equal(database.getReleaseReadiness(created.id).score, 85);
    database.setSetting("ai", { model: "small-model", language: "en" });
    assert.deepEqual(database.getSetting("ai", null), { model: "small-model", language: "en" });
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
