import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { StudioDatabase } from "./database.js";

function withDatabase(run: (database: StudioDatabase, directory: string) => void) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-manager-negative-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    run(database, directory);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function createRelease(database: StudioDatabase, title: string) {
  return database.createReleaseDraft({ artistId: "the-arkadiusz", title, primaryGenre: "Psytrance", story: "Negative-path integration test." });
}

function createApprovedCaption(database: StudioDatabase, releaseId: string) {
  const item = database.saveCampaignPackItems(releaseId, "en", "integration-model", [{ kind: "caption", channel: "Instagram", content: "Approved caption" }])[0]!;
  return database.updateCampaignPackItemStatus(item.id, "approved");
}

test("publishing queue rejects a caption that has not been approved", () => withDatabase((database) => {
  const release = createRelease(database, "Unapproved Caption");
  const caption = database.saveCampaignPackItems(release.id, "en", "integration-model", [{ kind: "caption", channel: "Instagram", content: "Draft caption" }])[0]!;
  assert.throws(() => database.createPublishingQueueItem({ releaseId: release.id, campaignPackItemId: caption.id, mediaGenerationId: null, platform: "Instagram", scheduledAt: null }), /Approve the caption/);
}));

test("publishing queue rejects media that is ready but not approved", () => withDatabase((database, directory) => {
  const release = createRelease(database, "Unapproved Media");
  const caption = createApprovedCaption(database, release.id);
  const prompt = database.saveCampaignPackItems(release.id, "en", "integration-model", [{ kind: "image-prompt", channel: null, content: "Artwork" }])[0]!;
  const media = database.createMediaGeneration(prompt, "comfyui", "image");
  const ready = database.updateMediaGeneration(media.id, { status: "ready", localPath: path.join(directory, "art.png"), mimeType: "image/png" });
  assert.throws(() => database.createPublishingQueueItem({ releaseId: release.id, campaignPackItemId: caption.id, mediaGenerationId: ready.id, platform: "Instagram", scheduledAt: null }), /Select approved media/);
}));

test("bootleg rights block official SoundCloud publishing", () => withDatabase((database) => {
  const release = createRelease(database, "Bootleg Rights Block");
  const caption = createApprovedCaption(database, release.id);
  database.importSoundCloudTracks([{ id: 7001, title: "Bootleg Track", permalink_url: "https://soundcloud.com/test/bootleg", artwork_url: null, created_at: "2026-08-30T00:00:00Z", duration: 180000, sharing: "public", streamable: true, playback_count: 1, favoritings_count: 0, comment_count: 0, reposts_count: 0, genre: "Psytrance", tag_list: "" }]);
  database.updateSoundCloudTrack({ id: 7001, artistId: "the-arkadiusz", catalogStatus: "unreviewed", contentType: "bootleg" });
  database.linkSoundCloudTrack(7001, release.id);
  const queued = database.createPublishingQueueItem({ releaseId: release.id, campaignPackItemId: caption.id, mediaGenerationId: null, platform: "SoundCloud", scheduledAt: "2026-09-01T18:00:00.000Z" });
  assert.equal(database.getPublishingQueueItem(queued.id)?.rightsBlocked, true);
  assert.throws(() => database.updatePublishingQueueStatus(queued.id, "approved"), /Bootleg rights are not cleared/);
}));

test("publishing status machine rejects illegal transitions", () => withDatabase((database) => {
  const release = createRelease(database, "Illegal Transition");
  const caption = createApprovedCaption(database, release.id);
  const queued = database.createPublishingQueueItem({ releaseId: release.id, campaignPackItemId: caption.id, mediaGenerationId: null, platform: "Instagram", scheduledAt: "2026-09-01T18:00:00.000Z" });
  assert.throws(() => database.updatePublishingQueueStatus(queued.id, "scheduled"), /Invalid publishing transition/);
}));

test("failed publishing can be recovered by returning to draft and rescheduling", () => withDatabase((database) => {
  const release = createRelease(database, "Publish Recovery");
  const caption = createApprovedCaption(database, release.id);
  const queued = database.createPublishingQueueItem({ releaseId: release.id, campaignPackItemId: caption.id, mediaGenerationId: null, platform: "Instagram", scheduledAt: "2026-09-01T18:00:00.000Z" });
  database.updatePublishingQueueStatus(queued.id, "approved");
  database.updatePublishingQueueStatus(queued.id, "scheduled");
  assert.equal(database.markPublishingFailed(queued.id, "temporary provider error").status, "failed");
  assert.equal(database.updatePublishingQueueStatus(queued.id, "draft").status, "draft");
  assert.equal(database.updatePublishingQueueStatus(queued.id, "approved").status, "approved");
  assert.equal(database.updatePublishingQueueStatus(queued.id, "scheduled").status, "scheduled");
}));
