import assert from "node:assert/strict";
import test from "node:test";
import { batchVideoIds, collectPlaylistVideoIds, dedupeVideoIds, extractUploadsPlaylistId, parseYouTubeChannel, parseYouTubeVideo, retainSnapshotAfterFailedSync, sanitizeYouTubeDataError, snapshotMatchesChannel } from "./youtube-data.js";

const channel = { id: "UC-1", snippet: { title: "Sonic Ark", thumbnails: { medium: { url: "https://img/channel.jpg", width: 320, height: 320 } } }, contentDetails: { relatedPlaylists: { uploads: "UU-1" } }, statistics: { subscriberCount: "1234", hiddenSubscriberCount: false, viewCount: "9876", videoCount: "8" } };

test("parses channel and uploads playlist metadata", () => {
  const parsed = parseYouTubeChannel(channel);
  assert.equal(parsed?.channelId, "UC-1");
  assert.equal(parsed?.subscriberCount, 1234);
  assert.equal(parsed?.uploadsPlaylistId, "UU-1");
  assert.equal(extractUploadsPlaylistId(channel), "UU-1");
});

test("collects paginated playlist IDs and removes duplicates in stable order", () => {
  const ids = collectPlaylistVideoIds([{ items: [{ snippet: { resourceId: { videoId: "a" } } }, { contentDetails: { videoId: "b" } }] }, { items: [{ snippet: { resourceId: { videoId: "b" } } }, { snippet: { resourceId: { videoId: "c" } } }] }]);
  assert.deepEqual(dedupeVideoIds(ids), ["a", "b", "c"]);
});

test("batches videos within the Data API limit", () => {
  assert.deepEqual(batchVideoIds(["a", "b", "c", "d", "e"], 2), [["a", "b"], ["c", "d"], ["e"]]);
});

test("parses missing optional video statistics and hidden subscribers safely", () => {
  const video = parseYouTubeVideo({ id: "v1", snippet: { title: "Upload", channelId: "UC-1" }, statistics: {}, status: {} });
  assert.equal(video?.viewCount, null);
  assert.equal(video?.likeCount, null);
  assert.equal(parseYouTubeChannel({ ...channel, statistics: { hiddenSubscriberCount: true } })?.hiddenSubscriberCount, true);
});

test("only accepts cached data for the connected channel and retains a prior snapshot after a failed sync", () => {
  const snapshot = { schemaVersion: 1, channelId: "UC-1", lastSuccessfulSyncAt: "2026-09-18T10:00:00.000Z", lastAttemptAt: "2026-09-18T10:00:00.000Z", channel: parseYouTubeChannel(channel), videos: [] };
  assert.equal(snapshotMatchesChannel(snapshot, "UC-1"), true);
  assert.equal(snapshotMatchesChannel(snapshot, "UC-other"), false);
  const retained = retainSnapshotAfterFailedSync(snapshot, "2026-09-18T10:05:00.000Z");
  assert.equal(retained.lastSuccessfulSyncAt, snapshot.lastSuccessfulSyncAt);
  assert.equal(retained.lastAttemptAt, "2026-09-18T10:05:00.000Z");
});

test("sanitizes OAuth secrets from sync failures", () => {
  const message = sanitizeYouTubeDataError("HTTP 401 access_token=secret refresh_token=refresh client_secret=client");
  assert.ok(!message.includes("access_token=secret"));
  assert.ok(message.includes("access_token=[redacted]"));
});