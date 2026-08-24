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
    assert.equal(database.health().schemaVersion, 15);
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
    assert.equal(database.listTasks(created.id).filter((task) => task.sourceKey?.startsWith("readiness:")).length, 6);
    const task = database.createTask({ releaseId: created.id, title: "Prepare short pitch", priority: "high", assignee: "ai", dueAt: "2026-09-01" });
    assert.equal(database.updateTaskStatus(task.id, "doing").status, "doing");
    const completedTask = database.saveTaskAgentOutput(task.id, "deepseek-r1:14b", "Draft pitch for human review.");
    assert.equal(completedTask.status, "done");
    assert.equal(completedTask.agentOutput, "Draft pitch for human review.");
    const soundCloudTracks = database.importSoundCloudTracks([{ id: 42, title: "Catalog Track", permalink_url: "https://soundcloud.com/artist/catalog-track", artwork_url: null, created_at: "2026-08-01T10:00:00Z", duration: 245000, sharing: "public", streamable: true, playback_count: 1200, favoritings_count: 95, comment_count: 7, reposts_count: 11, genre: "Psytrance", tag_list: "psytrance" }]);
    assert.equal(soundCloudTracks[0]?.id, 42);
    assert.equal(soundCloudTracks[0]?.playbackCount, 1200);
    assert.equal(soundCloudTracks[0]?.streamable, true);
    assert.equal(soundCloudTracks[0]?.likesCount, 95);
    assert.equal(soundCloudTracks[0]?.engagementRate, 9.42);
    assert.ok((soundCloudTracks[0]?.engagementScore ?? 0) > 0);
    assert.equal(soundCloudTracks[0]?.trend, "baseline");
    assert.equal(database.getSoundCloudTrackPerformance(42).points.length, 1);
    assert.equal(database.saveSpotifyArtistMappings([{ artistId: "the-arkadiusz", spotifyArtistId: "https://open.spotify.com/artist/1234567890ABCDEFGHIJKL" }])[0]?.spotifyArtistId, "1234567890ABCDEFGHIJKL");
    assert.equal(database.saveSpotifyArtistMappings([{ artistId: "the-arkadiusz", spotifyArtistId: "https://open.spotify.com/intl-de/artist/1wzJc2v61Ydpl7IB35w4NK?si=test" }])[0]?.spotifyArtistId, "1wzJc2v61Ydpl7IB35w4NK");
    database.importSpotifyReleases("the-arkadiusz", "1234567890ABCDEF", [{ id: "album1", name: "Album", album_type: "album", release_date: "2026-01-01", total_tracks: 8, images: [{ url: "https://image" }], external_urls: { spotify: "https://open.spotify.com/album/album1" } }]);
    assert.equal(database.listSpotifyReleases()[0]?.name, "Album");
    assert.equal(database.linkSpotifyRelease("album1", created.id).releaseTitle, "Different Perspective V2");
    assert.equal(database.linkSpotifyRelease("album1", null).releaseId, null);
    const pack=database.saveCampaignPackItems(created.id,"en","deepseek-r1:14b",[{kind:"caption",channel:"Instagram",content:"Campaign caption"}]);
    assert.equal(pack[0]?.content,"Campaign caption"); assert.equal(database.updateCampaignPackItemStatus(pack[0]!.id,"approved").status,"approved");
    const media=database.createMediaGeneration(pack[0]!,"openai","image");
    assert.equal(database.listMediaGenerations(created.id)[0]?.status,"queued");
    assert.equal(database.updateMediaGeneration(media.id,{status:"ready",localPath:path.join(directory,"result.png"),mimeType:"image/png"}).status,"ready");
    assert.equal(database.createMediaGeneration(pack[0]!,"comfyui","image").provider,"comfyui");
    const classifiedTrack = database.updateSoundCloudTrack({ id: 42, artistId: "the-arkadiusz", catalogStatus: "gem", contentType: "bootleg" });
    assert.equal(classifiedTrack.artistId, "the-arkadiusz");
    assert.equal(classifiedTrack.catalogStatus, "gem");
    assert.equal(classifiedTrack.contentType, "bootleg");
    assert.equal(database.setSoundCloudTracksContentType([42], "edit")[0]?.contentType, "edit");
    assert.equal(database.linkSoundCloudTrack(42, created.id).releaseTitle, "Different Perspective V2");
    assert.equal(database.linkSoundCloudTrack(42, null).releaseId, null);
    database.deleteRelease(created.id);
    assert.equal(database.listReleases().length, 0);
    assert.throws(() => database.getReleaseReadiness(created.id), /Release not found/);
    database.setSetting("ai", { model: "small-model", language: "en" });
    assert.deepEqual(database.getSetting("ai", null), { model: "small-model", language: "en" });
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
