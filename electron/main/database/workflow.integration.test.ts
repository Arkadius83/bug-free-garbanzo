import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { StudioDatabase } from "./database.js";

test("vertical release workflow survives restart and preserves publishing state", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-manager-e2e-"));
  const filePath = path.join(directory, "studio.sqlite");
  let releaseId = "";
  let queueId = "";

  try {
    const database = new StudioDatabase(filePath);
    database.initialize();

    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Phase 2C Vertical Slice", primaryGenre: "Psytrance", story: "Integration-test release workflow.", releaseDate: "2026-09-18" });
    releaseId = release.id;
    database.updateRelease({ id: release.id, artistId: release.artistId, title: release.title, primaryGenre: release.primaryGenre, story: release.story, releaseDate: release.releaseDate, status: "planned" });

    const audio = database.attachAsset({ releaseId, kind: "audio", filePath: path.join(directory, "master.wav"), fileName: "master.wav", mimeType: "audio/wav", sizeBytes: 1000, modifiedAt: null, width: null, height: null });
    database.saveAudioAnalysis({ id: "phase-2c-analysis", assetId: audio.id, status: "complete", analyzer: "ffmpeg-ebur128-v2", format: "pcm_s24le", durationSeconds: 300, sampleRate: 48000, channels: 2, bitDepth: 24, integratedLufs: -9, loudnessRangeLu: 4, truePeakDbtp: -0.9, bpm: 150, bpmConfidence: 95, alternateBpm: 75, musicalKey: "A minor", keyConfidence: 90, alternateKey: "C major", analyzedAt: "2026-08-30T20:00:00.000Z", note: null });
    database.attachAsset({ releaseId, kind: "cover", filePath: path.join(directory, "cover.png"), fileName: "cover.png", mimeType: "image/png", sizeBytes: 2000, modifiedAt: null, width: 3000, height: 3000 });

    const draft = database.saveGeneratedDraft({ releaseId, channel: "Instagram", language: "en", content: "Approved campaign draft.", model: "integration-model" });
    database.updateDraftStatus(draft.id, "approved");
    database.updateDraftStatus(draft.id, "scheduled");
    database.updateDraftStatus(draft.id, "published");

    const readiness = database.getReleaseReadiness(releaseId);
    assert.equal(readiness.score, 100);
    assert.equal(readiness.missing.length, 0);

    const pack = database.saveCampaignPackItems(releaseId, "en", "integration-model", [
      { kind: "caption", channel: "Instagram", content: "Approved campaign caption" },
      { kind: "image-prompt", channel: null, content: "Approved artwork prompt" }
    ]);
    const caption = database.updateCampaignPackItemStatus(pack[0]!.id, "approved");
    const imagePrompt = database.updateCampaignPackItemStatus(pack[1]!.id, "approved");

    const media = database.createMediaGeneration(imagePrompt, "comfyui", "image");
    const readyMedia = database.updateMediaGeneration(media.id, { status: "ready", localPath: path.join(directory, "generated-cover.png"), mimeType: "image/png" });

    const queueItem = database.createPublishingQueueItem({ releaseId, campaignPackItemId: caption.id, mediaGenerationId: readyMedia.id, platform: "Instagram", scheduledAt: "2026-09-17T18:00:00.000Z" });
    queueId = queueItem.id;
    assert.equal(database.updatePublishingQueueStatus(queueId, "approved").status, "approved");
    assert.equal(database.updatePublishingQueueStatus(queueId, "scheduled").status, "scheduled");
    database.close();

    const reopened = new StudioDatabase(filePath);
    reopened.initialize();
    assert.equal(reopened.listReleases().some((item) => item.id === releaseId), true);
    assert.equal(reopened.getReleaseReadiness(releaseId).score, 100);
    const persistedQueue = reopened.listPublishingQueue().find((item) => item.id === queueId);
    assert.equal(persistedQueue?.status, "scheduled");
    assert.equal(persistedQueue?.releaseId, releaseId);

    const published = reopened.markPublishingSucceeded(queueId, "instagram:artist", "remote-post-phase-2c");
    assert.equal(published.status, "published");
    assert.equal(published.remotePostId, "remote-post-phase-2c");
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
