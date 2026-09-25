import assert from "node:assert/strict";
import test from "node:test";
import type { AssetSummary, DistroKidFormPayload, ReleaseSummary } from "../shared/contracts.js";
import {
  DISTROKID_UPLOAD_URL,
  buildDistroKidFillScript,
  buildDistroKidFillPlan,
  buildDistroKidFormPayload,
  composeDistroKidFillResult,
  mapDistroKidPrimaryGenreKeywords,
  mapDistroKidSubGenreKeywords,
  mapDistroKidSecondaryGenreKeywords,
  mapUploadTargets,
  type DistroKidPageReport,
} from "./distrokid-form.js";

const release: ReleaseSummary = {
  id: "r1",
  title: "  Sacred Orbit  ",
  artistId: "the-arkadiusz",
  artistName: " Arkadiusz ",
  primaryGenre: "Psytrance",
  story: "",
  status: "planned",
  releaseDate: "2026-11-14T00:00:00.000Z",
  createdAt: "2026-09-01T10:00:00.000Z",
};

function asset(overrides: Partial<AssetSummary> & Pick<AssetSummary, "kind" | "fileName">): AssetSummary {
  return {
    id: overrides.id ?? `a-${overrides.fileName}`,
    releaseId: "r1",
    trackId: null,
    filePath: `E:\\music\\${overrides.fileName}`,
    mimeType: null,
    sizeBytes: 1000,
    modifiedAt: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    width: null,
    height: null,
    ...overrides,
  };
}

function context(overrides: Partial<Parameters<typeof buildDistroKidFormPayload>[2]> = {}) {
  return {
    spotifyUrl: "https://open.spotify.com/artist/SPOTIFY123",
    youtubeUrl: "https://music.youtube.com/channel/UC123",
    language: "en" as const,
    secondaryGenre: "Dark Psy",
    recordLabel: "Sonic Ark Records",
    songwriter: { firstName: "Arkadiusz", lastName: "Kowalski", role: "support" },
    appleUrl: null,
    trackPrice: null,
    albumPrice: null,
    instrumental: false,
    ...overrides,
  };
}

test("builds a DistroKid payload from a MAM release, assets, and mappings", () => {
  const payload = buildDistroKidFormPayload(release, [
    asset({ kind: "audio", fileName: "sacred-orbit-master.wav" }),
    asset({ kind: "audio", fileName: "sacred-orbit-radio.wav" }),
    asset({ kind: "cover", fileName: "sacred-orbit-cover.png" }),
  ], context());
  assert.equal(payload.releaseId, "r1");
  assert.equal(payload.songTitle, "Sacred Orbit");
  assert.equal(payload.artistName, "Arkadiusz");
  assert.equal(payload.genre, "Psytrance");
  assert.equal(payload.secondaryGenre, "Dark Psy");
  assert.equal(payload.releaseDate, "2026-11-14");
  assert.equal(payload.songCount, 2);
  assert.equal(payload.language, "en");
  assert.deepEqual(payload.audioFiles, [
    { fileName: "sacred-orbit-master.wav", filePath: "E:\\music\\sacred-orbit-master.wav" },
    { fileName: "sacred-orbit-radio.wav", filePath: "E:\\music\\sacred-orbit-radio.wav" },
  ]);
  assert.equal(payload.artworkFilePath, "E:\\music\\sacred-orbit-cover.png");
  assert.equal(payload.coverFileName, "sacred-orbit-cover.png");
  assert.equal(payload.artistMappings.spotifyUrl, "https://open.spotify.com/artist/SPOTIFY123");
  assert.equal(payload.artistMappings.youtubeUrl, "https://music.youtube.com/channel/UC123");
  assert.equal(payload.artistMappings.appleUrl, null);
  assert.equal(payload.recordLabel, "Sonic Ark Records");
  assert.deepEqual(payload.songwriter, { firstName: "Arkadiusz", lastName: "Kowalski", role: "support" });
  assert.equal(payload.trackPrice, null);
  assert.equal(payload.albumPrice, null);
  assert.equal(payload.instrumental, false);
  assert.ok(payload.preparedAt);
});

test("maps a release without a date or assets to null fields", () => {
  const payload = buildDistroKidFormPayload({ ...release, releaseDate: null }, [], context({ spotifyUrl: null, youtubeUrl: null, secondaryGenre: null, recordLabel: null, songwriter: null }));
  assert.equal(payload.releaseDate, null);
  assert.equal(payload.songCount, 0);
  assert.deepEqual(payload.audioFiles, []);
  assert.equal(payload.artworkFilePath, null);
  assert.equal(payload.coverFileName, null);
  assert.equal(payload.secondaryGenre, null);
  assert.equal(payload.artistMappings.spotifyUrl, null);
  assert.equal(payload.artistMappings.youtubeUrl, null);
  assert.equal(payload.recordLabel, null);
  assert.equal(payload.songwriter, null);
  assert.equal(payload.instrumental, false);
});

test("maps MAM psytrance-style genres to DistroKid primary genre keywords", () => {
  assert.deepEqual(mapDistroKidPrimaryGenreKeywords("Psytrance"), ["elektronisch", "electronic"]);
  assert.deepEqual(mapDistroKidPrimaryGenreKeywords("Hi-Tech Psytrance"), ["elektronisch", "electronic"]);
  assert.deepEqual(mapDistroKidPrimaryGenreKeywords("Techno"), ["elektronisch", "electronic"]);
  assert.ok(!mapDistroKidPrimaryGenreKeywords("Hi-Tech Psytrance").includes("dance"));
  assert.ok(!mapDistroKidPrimaryGenreKeywords("Hi-Tech Psytrance").includes("club"));
});

test("maps psytrance variants to psytrance subgenre keywords", () => {
  assert.deepEqual(mapDistroKidSubGenreKeywords("Hi-Tech Psytrance"), ["psy-trance", "psytrance", "psy trance", "trance"]);
  assert.deepEqual(mapDistroKidSubGenreKeywords("Dark Psy"), ["psy-trance", "psytrance", "psy trance", "trance"]);
  assert.deepEqual(mapDistroKidSubGenreKeywords("Full-On Psytrance"), ["psy-trance", "psytrance", "psy trance", "trance"]);
  assert.deepEqual(mapDistroKidSubGenreKeywords("Hard Trance"), ["hard trance", "trance"]);
});

test("keeps secondary genre mapping independent of primary genre", () => {
  assert.deepEqual(mapDistroKidSecondaryGenreKeywords("Hard Trance"), ["elektronisch", "electronic"]);
  assert.deepEqual(mapDistroKidSecondaryGenreKeywords("Dark Psy"), ["elektronisch", "electronic"]);
  assert.deepEqual(mapDistroKidSecondaryGenreKeywords("Hard Trance"), ["elektronisch", "electronic"]);
  assert.deepEqual(mapDistroKidSecondaryGenreKeywords(""), []);
  assert.ok(!mapDistroKidSecondaryGenreKeywords("Hard Trance").includes("dance"));
});

test("fill plan embeds Electronic/Psytrance mapping without dance fallback", () => {
  const payload = buildDistroKidFormPayload({ ...release, primaryGenre: "Hi-Tech Psytrance" }, [], context({ secondaryGenre: "Hard Trance" }));
  const plan = buildDistroKidFillPlan(payload);
  assert.deepEqual(plan.primaryGenreKeywords, ["elektronisch", "electronic"]);
  assert.deepEqual(plan.subGenreKeywords, ["psy-trance", "psytrance", "psy trance", "trance"]);
  assert.deepEqual(plan.secondaryGenreKeywords, ["elektronisch", "electronic"]);
  assert.deepEqual(plan.secondarySubGenreKeywords, ["hard trance", "trance"]);
  assert.ok(!plan.primaryGenreKeywords.includes("dance"));
  assert.ok(!plan.secondaryGenreKeywords.includes("dance"));
  assert.ok(!plan.secondarySubGenreKeywords.includes("dance"));
});

test("fill plan derives tracks, language tiers, and mapping URLs", () => {
  const payload = buildDistroKidFormPayload(release, [
    asset({ kind: "audio", fileName: "a.wav" }),
    asset({ kind: "cover", fileName: "cover.png" }),
  ], context({ language: "de", trackPrice: "1,29 $", albumPrice: "4,99 $", instrumental: true, appleUrl: "https://music.apple.com/us/artist/x/1" }));
  const plan = buildDistroKidFillPlan(payload);
  assert.equal(plan.songCount, 1);
  assert.equal(plan.albumTitle, "Sacred Orbit");
  assert.deepEqual(plan.languageKeywords[0], ["german"]);
  assert.equal(plan.mappings.spotifyUrl, "https://open.spotify.com/artist/SPOTIFY123");
  assert.equal(plan.mappings.appleUrl, "https://music.apple.com/us/artist/x/1");
  assert.equal(plan.recordLabel, "Sonic Ark Records");
  assert.deepEqual(plan.songwriter, { firstName: "Arkadiusz", lastName: "Kowalski", role: "support" });
  assert.equal(plan.trackPrice, "1,29 $");
  assert.equal(plan.albumPrice, "4,99 $");
  assert.equal(plan.instrumental, true);
  assert.equal(plan.tracks.length, 1);
  assert.equal(plan.tracks[0]?.title, "Sacred Orbit");
  assert.equal(plan.fileCount.artwork, 1);
  assert.equal(plan.fileCount.audio, 1);
});

test("instrumental mapping prefers has-lyrics vs instrumental option labels", () => {
  const withLyrics = buildDistroKidFillScript(buildDistroKidFormPayload(release, [], context({ instrumental: false })));
  assert.match(withLyrics, /\[\["hat lyrics"\]/);
  const instrumental = buildDistroKidFillScript(buildDistroKidFormPayload(release, [], context({ instrumental: true })));
  assert.match(instrumental, /instrumental und hat keine lyrics/);
});

test("fill script waits for Spotify artist lookup to settle then re-applies mapping", () => {
  const withoutSpotify = buildDistroKidFillScript(buildDistroKidFormPayload(release, [], context({ spotifyUrl: null })));
  assert.match(withoutSpotify, /waitSpotifySettle/);
  assert.match(withoutSpotify, /spotifyIntentMet/);
  assert.match(withoutSpotify, /applySpotifyRadio/);
  assert.match(withoutSpotify, /attempt < 4/);
  assert.match(withoutSpotify, /das wird mein erster/);
  assert.match(withoutSpotify, /spotify-url", "no-data"/);
  const withSpotify = buildDistroKidFillScript(buildDistroKidFormPayload(release, [], context({ spotifyUrl: "https://open.spotify.com/artist/SPOTIFY123" })));
  assert.match(withSpotify, /waitSpotifySettle/);
  assert.match(withSpotify, /spotifyIntentMet/);
  assert.match(withSpotify, /ja - gruppiere|es gibt eine Seite/);
  assert.match(withSpotify, /open\.spotify\.com\/artist\/SPOTIFY123/);
  assert.match(withSpotify, /spotify:artist:/);
});

test("fill script Spotify re-apply does not change Apple or YouTube mapping blocks", () => {
  const script = buildDistroKidFillScript(buildDistroKidFormPayload(release, [], context({ spotifyUrl: null, youtubeUrl: "https://music.youtube.com/channel/UC123", appleUrl: null })));
  assert.match(script, /setRadioDecision\("youtube-mapping"/);
  assert.match(script, /setRadioDecision\("apple-mapping"|note\("apple-mapping", "no-data"/);
  assert.doesNotMatch(script, /waitAppleSettle|waitYoutubeSettle/);
});

test("fill script embeds payload values and returns a structured report", () => {
  const payload: DistroKidFormPayload = buildDistroKidFormPayload(release, [asset({ kind: "audio", fileName: "track.wav" })], context());
  const script = buildDistroKidFillScript(payload);
  assert.match(script, /Sacred Orbit/);
  assert.match(script, /Arkadiusz/);
  assert.match(script, /psytrance/i);
  assert.match(script, /2026-11-14/);
  assert.match(script, /return report/);
  assert.match(script, /HTMLSelectElement/);
  assert.match(script, /data-mam-dk/);
  assert.match(script, /loginRequired/);
  assert.match(script, /norm\(option\.text\) === keyword/);
});

test("fill script never submits or clicks anything", () => {
  const script = buildDistroKidFillScript(buildDistroKidFormPayload(release, [], context()));
  assert.doesNotMatch(script, /\.submit\(/);
  assert.doesNotMatch(script, /form\.submit/);
  assert.doesNotMatch(script, /\.click\(/);
  assert.doesNotMatch(script, /requestSubmit/);
  assert.match(script, /type === "submit"/);
  assert.match(script, /checkbox/);
});

test("fill script never touches mandatory or service checkboxes by design", () => {
  const script = buildDistroKidFillScript(buildDistroKidFormPayload(release, [], context()));
  assert.match(script, /mandatory\|areyousure\|nonstandardcaps\|donebutton\|\^chk\|swal/i);
  assert.doesNotMatch(script, /forceCheck\s*:\s*true/);
});

test("file upload targets use absolute paths from MAM assets", () => {
  const payload = buildDistroKidFormPayload(release, [
    asset({ kind: "audio", fileName: "one.wav" }),
    asset({ kind: "cover", fileName: "cover.jpg" }),
  ], context());
  const targets = mapUploadTargets(payload);
  assert.equal(targets.length, 2);
  assert.equal(targets[0]?.kind, "artwork");
  assert.equal(targets[0]?.filePath, "E:\\music\\cover.jpg");
  assert.equal(targets[0]?.selector, 'input[data-mam-dk="artwork"]');
  assert.equal(targets[1]?.kind, "audio");
  assert.equal(targets[1]?.filePath, "E:\\music\\one.wav");
  assert.equal(targets[1]?.selector, 'input[data-mam-dk="audio-1"]');
});

function page(overrides: Partial<DistroKidPageReport> = {}): DistroKidPageReport {
  return {
    loginRequired: false,
    formDetected: true,
    fields: [
      { id: "artist-name", track: null, status: "filled", expected: "Arkadiusz", actual: "Arkadiusz" },
      { id: "record-label", track: null, status: "no-data", expected: null, actual: null },
      { id: "track-price", track: null, status: "no-data", expected: null, actual: null },
    ],
    safety: { clicks: 0, checkboxesTouched: 0 },
    ...overrides,
  };
}

test("compose result reports filled count, files, and manual leftovers", () => {
  const result = composeDistroKidFillResult(page(), [
    { kind: "artwork", track: null, fileName: "cover.png", selector: "input", status: "attached" },
    { kind: "audio", track: 1, fileName: "a.wav", selector: "input", status: "missing-on-disk" },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.filledFields, 1);
  assert.equal(result.loginRequired, false);
  assert.equal(result.fields.length, 3);
  assert.match(result.message, /Filled 1 field/);
  assert.match(result.message, /Files: 1\/2 attached/);
  assert.match(result.message, /record-label/);
  assert.match(result.message, /nothing is submitted automatically/);
});

test("compose result flags login required without claiming success", () => {
  const result = composeDistroKidFillResult(page({ loginRequired: true, formDetected: false, fields: [] }), []);
  assert.equal(result.ok, false);
  assert.equal(result.loginRequired, true);
  assert.equal(result.filledFields, 0);
  assert.match(result.message, /Sign in to DistroKid/);
});

test("compose result reports a missing form", () => {
  const result = composeDistroKidFillResult(page({ formDetected: false, fields: [] }), []);
  assert.equal(result.ok, false);
  assert.equal(result.loginRequired, false);
  assert.match(result.message, /upload form not found/);
});

test("upload URL points at the public DistroKid upload form", () => {
  assert.equal(DISTROKID_UPLOAD_URL, "https://distrokid.com/new");
});
