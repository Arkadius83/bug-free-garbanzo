import type { AssetSummary, ContentLanguage, DistroKidArtistDefaults, DistroKidFieldReport, DistroKidFieldStatus, DistroKidFillResult, DistroKidFileReport, DistroKidFormPayload, DistroKidSongwriter, ReleaseSummary } from "../shared/contracts.js";

export const DISTROKID_UPLOAD_URL = "https://distrokid.com/new";

export const DISTROKID_SELECTORS = {
  songCount: "#howManySongsOnThisAlbum",
  releaseDate: "#release-date-dp",
  recordLabel: "#recordLabel",
  recordLabelHidden: 'input[name="recordLabelLabel"]',
  albumTitle: "#albumTitleInput",
  genrePrimary: "#genrePrimary",
  subGenrePrimary: "#subGenrePrimary",
  genreSecondary: "#genreSecondary",
  subGenreSecondary: "#subGenreSecondary",
  artwork: "#artwork",
  trackTitle: (track: number) => `.uploadFileTitle[tracknum="${track}"]`,
  trackTitlePlaceholder: (track: number) => `input[placeholder="Track ${track} title"]`,
  trackAudio: (track: number) => `#js-track-upload-${track}`,
  trackTable: (track: number) => `#js-track-table-${track}`,
  songwriterFirst: (track: number) => `.songwriter_real_name_first[tracknum="${track}"]`,
  songwriterLast: (track: number) => `.songwriter_real_name_last[tracknum="${track}"]`,
  fileMarker: (token: string) => `input[data-mam-dk="${token}"]`,
} as const;

const FORBIDDEN_CONTROL_PATTERN = /mandatory|areyousure|nonstandardcaps|donebutton|^chk|swal/i;

const LANGUAGE_OPTION_KEYWORDS: Record<ContentLanguage, string[][]> = {
  en: [["english"], ["englisch"]],
  de: [["german"], ["deutsch"]],
  pl: [["polish"], ["polski"], ["polnisch"]],
};

export interface DistroKidFillContext {
  spotifyUrl: string | null;
  youtubeUrl: string | null;
  language: ContentLanguage;
  secondaryGenre: string | null;
  recordLabel: string | null;
  songwriter: DistroKidSongwriter | null;
  appleUrl: string | null;
  trackPrice: string | null;
  albumPrice: string | null;
  instrumental: boolean;
}

export interface DistroKidFillPlan {
  songCount: number | null;
  songTitle: string;
  albumTitle: string;
  artistName: string;
  primaryGenreKeywords: string[];
  subGenreKeywords: string[];
  secondaryGenreKeywords: string[];
  secondarySubGenreKeywords: string[];
  releaseDate: string | null;
  languageKeywords: string[][];
  tracks: Array<{ index: number; title: string }>;
  fileCount: { artwork: number; audio: number };
  mappings: { spotifyUrl: string | null; youtubeUrl: string | null; appleUrl: string | null };
  recordLabel: string | null;
  songwriter: DistroKidSongwriter | null;
  trackPrice: string | null;
  albumPrice: string | null;
  instrumental: boolean;
}

export interface DistroKidPageField {
  id: string;
  track: number | null;
  status: DistroKidFieldStatus;
  expected: string | null;
  actual: string | null;
}

export interface DistroKidPageReport {
  loginRequired: boolean;
  formDetected: boolean;
  fields: DistroKidPageField[];
  safety: { clicks: number; checkboxesTouched: number };
}

export function buildDistroKidFormPayload(release: ReleaseSummary, assets: AssetSummary[], context: DistroKidFillContext): DistroKidFormPayload {
  const audio = assets.filter((asset) => asset.kind === "audio");
  const cover = assets.find((asset) => asset.kind === "cover");
  return {
    releaseId: release.id,
    songTitle: release.title.trim(),
    artistName: release.artistName.trim(),
    genre: release.primaryGenre.trim(),
    secondaryGenre: context.secondaryGenre,
    releaseDate: release.releaseDate ? release.releaseDate.slice(0, 10) : null,
    songCount: audio.length,
    language: context.language,
    audioFiles: audio.map((asset) => ({ fileName: asset.fileName, filePath: asset.filePath })),
    artworkFilePath: cover?.filePath ?? null,
    coverFileName: cover?.fileName ?? null,
    artistMappings: { spotifyUrl: context.spotifyUrl, youtubeUrl: context.youtubeUrl, appleUrl: context.appleUrl },
    recordLabel: context.recordLabel,
    songwriter: context.songwriter,
    trackPrice: context.trackPrice,
    albumPrice: context.albumPrice,
    instrumental: context.instrumental,
    preparedAt: new Date().toISOString(),
  };
}

export function mapDistroKidPrimaryGenreKeywords(genre: string): string[] {
  const text = genre.toLowerCase();
  const electronic = /psy|trance|techno|hi-?tech|psybient|psychill|downtempo|ambient|house|edm|electro|drum|bass|garage|wave/;
  if (electronic.test(text)) return ["elektronisch", "electronic"];
  if (/hip.?hop|rap/.test(text)) return ["hip hop", "rap"];
  if (/r&b|rnb|soul/.test(text)) return ["r&b", "soul"];
  if (/jazz/.test(text)) return ["jazz"];
  if (/classical|orchestral|klassisch/.test(text)) return ["klassisch", "classical"];
  if (/metal/.test(text)) return ["metal"];
  if (/rock/.test(text)) return ["rock"];
  if (/pop/.test(text)) return ["pop"];
  if (/country/.test(text)) return ["country"];
  if (/reggae/.test(text)) return ["reggae"];
  return ["elektronisch", "electronic"];
}

export function mapDistroKidSubGenreKeywords(genre: string): string[] {
  const text = genre.trim();
  if (!text) return [];
  const lower = text.toLowerCase();
  if (/hi-?tech|psytrance|dark.?psy|forest|full.?on|classic.?psy|progressive.?psy|psy-tech|psybient|psychill|psy/.test(lower)) {
    return ["psy-trance", "psytrance", "psy trance", "trance"];
  }
  if (/hard trance|hard-trance/.test(lower)) return ["hard trance", "trance"];
  if (/trance/.test(lower)) return ["trance"];
  const parts = lower.split(/[\s/]+/).filter((part) => part.length > 2);
  return [lower, ...parts];
}

export function mapDistroKidSecondaryGenreKeywords(secondaryGenre: string): string[] {
  const text = secondaryGenre.trim();
  if (!text) return [];
  const lower = text.toLowerCase();
  const electronicSecondary = /psy|trance|techno|hi-?tech|psybient|psychill|downtempo|ambient|house|edm|electro|drum|bass|garage|wave|hard/.test(lower);
  if (electronicSecondary) return ["elektronisch", "electronic"];
  return mapDistroKidPrimaryGenreKeywords(text);
}

export function buildDistroKidFillPlan(payload: DistroKidFormPayload): DistroKidFillPlan {
  const songCount = payload.songCount > 0 ? payload.songCount : null;
  const trackCount = songCount ?? Math.max(payload.audioFiles.length, 1);
  const tracks = Array.from({ length: trackCount }, (_, index) => ({
    index: index + 1,
    title: payload.audioFiles[index]?.fileName
      ? stripAudioExtension(payload.audioFiles[index]!.fileName)
      : payload.songTitle,
  }));
  if (tracks.length === 1) tracks[0]!.title = payload.songTitle;
  return {
    songCount,
    songTitle: payload.songTitle,
    albumTitle: payload.songTitle,
    artistName: payload.artistName,
    primaryGenreKeywords: mapDistroKidPrimaryGenreKeywords(payload.genre),
    subGenreKeywords: mapDistroKidSubGenreKeywords(payload.genre),
    secondaryGenreKeywords: mapDistroKidSecondaryGenreKeywords(payload.secondaryGenre ?? ""),
    secondarySubGenreKeywords: mapDistroKidSubGenreKeywords(payload.secondaryGenre ?? ""),
    releaseDate: payload.releaseDate,
    languageKeywords: LANGUAGE_OPTION_KEYWORDS[payload.language] ?? LANGUAGE_OPTION_KEYWORDS.en,
    tracks,
    fileCount: { artwork: payload.artworkFilePath ? 1 : 0, audio: payload.audioFiles.length },
    mappings: {
      spotifyUrl: payload.artistMappings.spotifyUrl,
      youtubeUrl: payload.artistMappings.youtubeUrl,
      appleUrl: payload.artistMappings.appleUrl,
    },
    recordLabel: payload.recordLabel,
    songwriter: payload.songwriter,
    trackPrice: payload.trackPrice,
    albumPrice: payload.albumPrice,
    instrumental: payload.instrumental,
  };
}

function stripAudioExtension(fileName: string): string {
  return fileName.replace(/\.(wav|mp3|flac|aiff?|m4a|ogg)$/i, "");
}

export function buildDistroKidFillScript(payload: DistroKidFormPayload): string {
  const plan = JSON.stringify(buildDistroKidFillPlan(payload));
  return `(async () => {
  const plan = ${plan};
  const report = { loginRequired: false, formDetected: false, fields: [], safety: { clicks: 0, checkboxesTouched: 0 } };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const note = (id, status, expected, actual, track) => {
    report.fields.push({ id, track: track == null ? null : track, status, expected: expected == null ? null : String(expected), actual: actual == null ? null : String(actual) });
  };
  const norm = (value) => String(value == null ? "" : value).replace(/\\s+/g, " ").trim().toLowerCase();
  const forbiddenId = ${FORBIDDEN_CONTROL_PATTERN.toString()};
  const isForbidden = (el) => {
    if (!el) return true;
    if (el.type === "checkbox") return true;
    if (el.type === "submit" || el.type === "button" || el.type === "image" || el.type === "file" || el.type === "reset") return true;
    const key = String(el.id || "") + " " + String(el.name || "");
    if (forbiddenId.test(key)) return true;
    if (el.type === "radio" && /^(socialmediapack|mandatory|areyousure)/i.test(String(el.name || ""))) return true;
    return false;
  };
  const labelText = (el) => {
    if (!el) return "";
    let text = "";
    if (el.id) {
      const forLabel = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (forLabel) text += " " + (forLabel.textContent || "");
    }
    const wrapping = el.closest("label");
    if (wrapping) text += " " + (wrapping.textContent || "");
    text += " " + (el.getAttribute("placeholder") || "");
    text += " " + (el.getAttribute("aria-label") || "");
    text += " " + (el.getAttribute("name") || "");
    text += " " + (el.id || "");
    const row = el.closest("tr, li, .form-row, .field-row, fieldset, .radio-group, .question, div");
    if (row) text += " " + (row.textContent || "").slice(0, 240);
    return text;
  };
  const setValue = (el, value) => {
    if (isForbidden(el) || value == null || value === "") return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    const before = el.value;
    if (desc && desc.set) desc.set.call(el, String(value));
    else el.value = String(value);
    if (el.value === before && String(value) !== before) return false;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  };
  const setSelectKeywords = (el, keywordTiers) => {
    if (!(el instanceof HTMLSelectElement) || isForbidden(el)) return null;
    const options = Array.from(el.options);
    for (const tier of keywordTiers) {
      const match =
        options.find((option) => tier.some((keyword) => norm(option.text) === keyword)) ||
        options.find((option) => tier.some((keyword) => norm(option.text).includes(keyword)));
      if (match && match.value !== el.value) {
        const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
        if (desc && desc.set) desc.set.call(el, match.value);
        else el.value = match.value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return match.text.trim();
      }
      if (match && match.value === el.value) return match.text.trim();
    }
    return null;
  };
  const findControl = (selector) => {
    const el = document.querySelector(selector);
    if (el && !isForbidden(el)) return el;
    return null;
  };
  const fillTextById = (id, selector, value) => {
    if (value == null || value === "") { note(id, "no-data", null, null, null); return; }
    const el = findControl(selector);
    if (!el || el instanceof HTMLSelectElement || el.type === "radio") { note(id, "not-found", value, null, null); return; }
    const before = el.value;
    if (before === value) { note(id, "already", value, value, null); return; }
    if (setValue(el, value)) note(id, "filled", value, el.value, null);
    else note(id, "mismatch", value, el.value, null);
  };
  const fillSelectById = async (id, selector, keywordTiers, expectedLabel) => {
    const el = findControl(selector);
    if (!el || !(el instanceof HTMLSelectElement)) { note(id, "not-found", expectedLabel, null, null); return; }
    const deadline = Date.now() + 3500;
    let chosen = setSelectKeywords(el, keywordTiers);
    while (!chosen && Date.now() < deadline) {
      if (el.options.length > 1) chosen = setSelectKeywords(el, keywordTiers);
      if (chosen) break;
      await sleep(200);
    }
    if (!chosen) { note(id, "not-found", expectedLabel, el.value, null); return; }
    note(id, "filled", expectedLabel || chosen, chosen, null);
  };
  const radioGroups = () => {
    const groups = new Map();
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
    for (const radio of radios) {
      if (isForbidden(radio)) continue;
      const key = radio.name || radio.id || labelText(radio);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(radio);
    }
    return groups;
  };
  const questionTextFor = (group) => {
    let text = "";
    const first = group[0];
    if (first && first.name) text += " " + first.name;
    const fieldset = first ? first.closest("fieldset") : null;
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend) text += " " + (legend.textContent || "");
      const question = fieldset.querySelector(".question, .radio-question, h3, h4, p");
      if (question) text += " " + (question.textContent || "");
    }
    return norm(text);
  };
  const setRadioDecision = (id, namePattern, questionKeywords, optionTiers, track) => {
    const pattern = namePattern instanceof RegExp ? namePattern : new RegExp(namePattern, "i");
    const groups = Array.from(radioGroups().entries());
    const named = groups.filter(([key]) => pattern.test(String(key)));
    const useGroups = named.length
      ? named
      : groups.filter(([, group]) => questionKeywords.some((keyword) => questionTextFor(group).includes(keyword)));
    for (const [, group] of useGroups) {
      for (const tier of optionTiers) {
        const match = group.find((radio) => {
          const label = norm(labelText(radio) || radio.value);
          return tier.some((keyword) => label === keyword || label.includes(keyword));
        });
        if (!match) continue;
        if (match.checked) { note(id, "filled", tier[0], norm(labelText(match) || match.value), track); return true; }
        const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked");
        if (desc && desc.set) desc.set.call(match, true);
        else match.checked = true;
        match.dispatchEvent(new Event("input", { bubbles: true }));
        match.dispatchEvent(new Event("change", { bubbles: true }));
        note(id, match.checked ? "filled" : "error", tier[0], norm(labelText(match) || match.value), track);
        return true;
      }
    }
    note(id, "not-found", optionTiers[0] && optionTiers[0][0], null, track);
    return false;
  };
  const fillSelectByQuestion = (id, questionKeywords, keywordTiers, track) => {
    const selects = Array.from(document.querySelectorAll("select"));
    for (const select of selects) {
      if (isForbidden(select)) continue;
      const context = norm(labelText(select));
      if (!questionKeywords.some((keyword) => context.includes(keyword))) continue;
      const chosen = setSelectKeywords(select, keywordTiers);
      if (chosen) { note(id, "filled", chosen, chosen, track); return true; }
    }
    note(id, "not-found", keywordTiers[0] && keywordTiers[0][0], null, track);
    return false;
  };
  const markFileInput = (selector, token) => {
    const el = document.querySelector(selector);
    if (!el || el.type !== "file") return false;
    el.setAttribute("data-mam-dk", token);
    return true;
  };
  const detectState = async () => {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const path = location.pathname.toLowerCase();
      if (document.querySelector("#inputSigninEmail") || document.querySelector("#inputPassword") || path.includes("/login") || path.includes("/signin")) {
        report.loginRequired = true;
        return;
      }
      if (findControl(plan.songCount != null ? "#howManySongsOnThisAlbum" : "#genrePrimary") || document.querySelector("#albumTitleInput") || document.querySelector(".uploadFileTitle") || document.querySelector("#genrePrimary")) {
        report.formDetected = true;
        return;
      }
      await sleep(150);
    }
    report.formDetected = Boolean(document.querySelector("#genrePrimary") || document.querySelector(".uploadFileTitle") || document.querySelector("#howManySongsOnThisAlbum"));
  };
  const applyStages = async () => {
    if (plan.songCount != null) {
      const tiers = [[String(plan.songCount) + " song"], [String(plan.songCount) + " songs"], [String(plan.songCount) + " lied"], [String(plan.songCount) + " lieder"], [String(plan.songCount)]];
      const select = findControl("#howManySongsOnThisAlbum");
      if (select && select instanceof HTMLSelectElement) {
        const chosen = setSelectKeywords(select, tiers);
        note("song-count", chosen ? "filled" : "not-found", tiers[0][0], chosen, null);
      } else {
        note("song-count", "not-found", tiers[0][0], null, null);
      }
      const wanted = plan.songCount;
      const trackDeadline = Date.now() + 8000;
      while (Date.now() < trackDeadline) {
        const ready = Array.from({ length: wanted }, (_, i) => document.querySelector('.uploadFileTitle[tracknum="' + (i + 1) + '"]') || document.querySelector("#js-track-upload-" + (i + 1)));
        if (ready.every(Boolean)) break;
        await sleep(200);
      }
    }
    fillTextById("artist-name", '#artistName, input[name="bandname"], input[placeholder*="artist" i], input[placeholder*="band" i], input[name*="artistName" i]', plan.artistName);
    if (!report.fields.some((field) => field.id === "artist-name" && (field.status === "filled" || field.status === "already"))) {
      const selects = Array.from(document.querySelectorAll("select"));
      for (const select of selects) {
        if (isForbidden(select)) continue;
        const label = norm(labelText(select));
        if (!label.includes("artist") || label.includes("spotify") || label.includes("apple") || label.includes("youtube") || label.includes("google")) continue;
        const chosen = setSelectKeywords(select, [[norm(plan.artistName)], [plan.artistName]]);
        if (chosen) { note("artist-name", "filled", plan.artistName, chosen, null); break; }
      }
      if (!report.fields.some((field) => field.id === "artist-name")) note("artist-name", "not-found", plan.artistName, null, null);
    }
    fillTextById("album-title", "#albumTitleInput", plan.albumTitle);
    fillTextById("record-label", "#recordLabel", plan.recordLabel);
    await fillSelectById("language", "#language, select[name='language']", plan.languageKeywords, plan.languageKeywords[0] && plan.languageKeywords[0][0]);
    {
      const dateEl = findControl("#release-date-dp");
      if (!plan.releaseDate) note("release-date", "no-data", null, null, null);
      else if (!dateEl) note("release-date", "not-found", plan.releaseDate, null, null);
      else {
        const formats = [plan.releaseDate];
        const [year, month, day] = plan.releaseDate.split("-");
        if (year && month && day) formats.push(day + "." + month + "." + year, month + "/" + day + "/" + year);
        let ok = false;
        for (const format of formats) {
          if (setValue(dateEl, format)) {
            await sleep(120);
            if (dateEl.value && (dateEl.value.includes(plan.releaseDate) || dateEl.value.includes(day || "") || format !== plan.releaseDate)) { ok = dateEl.value.length > 0; if (norm(dateEl.value).includes(norm(plan.releaseDate)) || format === dateEl.value) break; }
          }
        }
        note("release-date", ok || dateEl.value ? (dateEl.value.includes(plan.releaseDate.slice(0, 4)) ? "filled" : "mismatch") : "mismatch", plan.releaseDate, dateEl.value, null);
      }
    }
    await fillSelectById("primary-genre", "#genrePrimary", plan.primaryGenreKeywords.map((keyword) => [keyword]), plan.primaryGenreKeywords[0]);
    {
      const subDeadline = Date.now() + 4000;
      const subSelect = () => {
        const el = document.querySelector("#subGenrePrimary");
        return el instanceof HTMLSelectElement ? el : null;
      };
      while (Date.now() < subDeadline) {
        const el = subSelect();
        if (el && el.options.length > 1) break;
        await sleep(200);
      }
    }
    if (plan.subGenreKeywords.length) await fillSelectById("primary-subgenre", "#subGenrePrimary, select[name='subGenrePrimary'], select[id*='subGenre' i]", plan.subGenreKeywords.map((keyword) => [keyword]), plan.subGenreKeywords[0]);
    if (plan.secondaryGenreKeywords.length) {
      await sleep(400);
      await fillSelectById("secondary-genre", "#genreSecondary, select[name='genreSecondary'], select[id*='genreSecondary' i]", plan.secondaryGenreKeywords.map((keyword) => [keyword]), plan.secondaryGenreKeywords[0]);
      await sleep(500);
    } else {
      note("secondary-genre", "no-data", null, null, null);
    }
    if (plan.secondarySubGenreKeywords.length) {
      await fillSelectById("secondary-subgenre", "#subGenreSecondary, select[name='subGenreSecondary']", plan.secondarySubGenreKeywords.map((keyword) => [keyword]), plan.secondarySubGenreKeywords[0]);
    } else {
      note("secondary-subgenre", "no-data", null, null, null);
    }
    setRadioDecision("previously-released", /^previouslyReleased/i, ["previously released", "zuvor veröffentlicht", "bereits veröffentlicht"], [["nein"], ["no"], ["not previously"]], null);
    setRadioDecision("featured-artist", /^feat_/i, ["featured artist", "feat artist", "gastmusiker"], [["nein, keine"], ["keine anderen"], ["no"], ["nein"], ["none"]], null);
    setRadioDecision("version-info", /^version_/i, ["version info", "versionsinfo", "normale version"], [["nein, das ist"], ["nein"], ["no"], ["none"]], null);
    setRadioDecision("dolby-atmos", /^dolby_/i, ["dolby", "atmos", "spatial audio"], [["nein"], ["no"], ["no dolby"]], null);
    setRadioDecision("ai-music", /^ai_gate_/i, ["ai-generated", "ki-generierte", "künstliche intelligenz"], [["nein"], ["no"], ["does not include"]], null);
    setRadioDecision("explicit-lyrics", /^explicit_/i, ["explicit lyrics", "explicit content", "explizite"], [["nein"], ["no"], ["clean"]], null);
    setRadioDecision("radio-edit", /^cleaned_/i, ["radio edit", "radiofassung", "explicit-version"], [["nein - dieser song ist clean"], ["clean"], ["nein"], ["no"], ["not a radio edit"]], null);
    {
      const instrumentalTiers = plan.instrumental
        ? [["instrumental und hat keine lyrics"], ["instrumental und keine lyrics"], ["ist instrumental"], ["instrumental"], ["hat keine lyrics"]]
        : [["hat lyrics"], ["dieser song hat lyrics"], ["contains lyrics"], ["nein"], ["no"], ["not instrumental"]];
      setRadioDecision("instrumental", /^instrumental_/i, ["instrumental", "instrumental version"], instrumentalTiers, null);
    }
    setRadioDecision("cover-song", /^coversong_/i, ["cover song", "is this a cover", "ist dies ein cover"], [["selbst geschrieben"], ["original"], ["ich habe diesen song"], ["no"], ["nein"]], null);
    if (plan.trackPrice) {
      await fillSelectById("track-price", "select[id^='price_'][tracknum], select[id^='price_'], select[name^='price_']", [[plan.trackPrice]], plan.trackPrice);
    } else {
      note("track-price", "no-data", null, null, null);
    }
    if (plan.albumPrice) {
      await fillSelectById("album-price", "#priceAlbum, select[name='priceAlbum']", [[plan.albumPrice]], plan.albumPrice);
    } else {
      note("album-price", "no-data", null, null, null);
    }
    if (plan.songwriter) {
      const legal = [plan.songwriter.firstName, plan.songwriter.middleName, plan.songwriter.lastName].filter(Boolean).join(" ");
      note("songwriter-legal-name", "filled", legal, legal, null);
    } else {
      note("songwriter-legal-name", "no-data", null, null, null);
    }
    {
      const spotifyTiers = plan.mappings.spotifyUrl
        ? [["es gibt eine Seite"], ["ja - gruppiere"], ["group"]]
        : [["das wird mein erster"], ["nein - das wird mein erster"], ["erster release"], ["first release"]];
      const spotifyValue = plan.mappings.spotifyUrl
        ? (/spotify:artist:/i.test(plan.mappings.spotifyUrl) ? plan.mappings.spotifyUrl : (() => {
            const match = /artist\\/([A-Za-z0-9]+)/i.exec(plan.mappings.spotifyUrl || "");
            return match ? "spotify:artist:" + match[1] : plan.mappings.spotifyUrl;
          })())
        : null;
      const spotifyCheckedRadio = () => Array.from(document.querySelectorAll('input[type="radio"]')).find((radio) => !isForbidden(radio) && /^spotifyArtistID/i.test(String(radio.name || "")) && radio.checked) || null;
      const spotifyIntentMet = () => {
        const checked = spotifyCheckedRadio();
        if (!checked) return false;
        const label = norm(labelText(checked) || checked.value);
        if (plan.mappings.spotifyUrl) {
          return label.includes("es gibt eine seite") || label.includes("ja - gruppiere") || label.includes("group");
        }
        return label.includes("das wird mein erster") || label.includes("nein - das wird") || label.includes("erster release") || label.includes("first release");
      };
      const applySpotifyRadio = () => {
        const pattern = /^spotifyArtistID/i;
        const groups = Array.from(radioGroups().entries()).filter(([key]) => pattern.test(String(key)));
        for (const [, group] of groups) {
          for (const tier of spotifyTiers) {
            const match = group.find((radio) => {
              const label = norm(labelText(radio) || radio.value);
              return tier.some((keyword) => label === keyword || label.includes(keyword));
            });
            if (!match) continue;
            if (match.checked) return true;
            const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked");
            if (desc && desc.set) desc.set.call(match, true);
            else match.checked = true;
            match.dispatchEvent(new Event("input", { bubbles: true }));
            match.dispatchEvent(new Event("change", { bubbles: true }));
            return Boolean(match.checked);
          }
        }
        return false;
      };
      const findSpotifyUriInput = () => {
        const candidates = Array.from(document.querySelectorAll('input[type="text"], input:not([type])')).filter((input) => {
          if (isForbidden(input)) return false;
          const ph = (input.getAttribute("placeholder") || "").toLowerCase();
          if (ph.includes("spotify:artist")) return true;
          const text = norm(labelText(input));
          return text.includes("spotify") && (text.includes("uri") || text.includes("künstler-uri") || text.includes("artist-uri"));
        });
        return candidates.find((input) => input.offsetParent !== null) || candidates[0] || null;
      };
      const applySpotifyUri = () => {
        if (!spotifyValue) return "no-data";
        const urlEl = findSpotifyUriInput();
        if (!urlEl) return "not-found";
        if (urlEl.value === spotifyValue) return "already";
        if (setValue(urlEl, spotifyValue)) return "filled";
        return "mismatch";
      };
      const waitSpotifySettle = async () => {
        const settleDeadline = Date.now() + 4000;
        let lastKey = "";
        let stableSince = Date.now();
        while (Date.now() < settleDeadline) {
          const checked = spotifyCheckedRadio();
          const key = checked ? String(checked.id || checked.name || checked.value) : "";
          if (key !== lastKey) {
            lastKey = key;
            stableSince = Date.now();
          } else if (Date.now() - stableSince >= 800) return;
          await sleep(200);
        }
      };
      await waitSpotifySettle();
      applySpotifyRadio();
      let uriStatus = applySpotifyUri();
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await sleep(600);
        const radioOk = spotifyIntentMet();
        const uriOk = plan.mappings.spotifyUrl ? uriStatus === "filled" || uriStatus === "already" : true;
        if (radioOk && uriOk) break;
        applySpotifyRadio();
        uriStatus = applySpotifyUri();
      }
      const finalRadio = spotifyCheckedRadio();
      const finalLabel = finalRadio ? norm(labelText(finalRadio) || finalRadio.value) : "";
      if (finalRadio && spotifyIntentMet()) note("spotify-mapping", "filled", spotifyTiers[0][0], finalLabel, null);
      else note("spotify-mapping", finalRadio ? "mismatch" : "not-found", spotifyTiers[0][0], finalLabel || null, null);
      if (!plan.mappings.spotifyUrl) note("spotify-url", "no-data", null, null, null);
      else if (uriStatus === "filled" || uriStatus === "already") note("spotify-url", uriStatus, spotifyValue, findSpotifyUriInput() ? findSpotifyUriInput().value : null, null);
      else if (uriStatus === "not-found") note("spotify-url", "not-found", spotifyValue, null, null);
      else note("spotify-url", uriStatus, spotifyValue, findSpotifyUriInput() ? findSpotifyUriInput().value : null, null);
    }
    setRadioDecision("youtube-mapping", /^(googleArtistID|youtubeArtistID)/i, ["youtube music", "youtube"], plan.mappings.youtubeUrl
      ? [["es gibt eine Seite"], ["ja - gruppiere"], ["group"]]
      : [["hat noch kein künstlerprofil"], ["nein - "]], null);
    await sleep(300);
    {
      const channelMatch = /channel\\/(UC[\\w-]+)/i.exec(plan.mappings.youtubeUrl || "");
      const youtubeValue = channelMatch ? channelMatch[1] : plan.mappings.youtubeUrl;
      const urlEl = Array.from(document.querySelectorAll('input[type="text"], input:not([type])')).find((input) => {
        if (isForbidden(input)) return false;
        const ph = (input.getAttribute("placeholder") || "").toLowerCase();
        if (ph.includes("uc1a") || ph.includes("youtube") || ph.includes("google") || ph.includes("channel")) return true;
        const text = norm(labelText(input));
        return (text.includes("youtube") || text.includes("google") || text.includes("music channel") || text.includes("channel")) && (text.includes("url") || text.includes("link") || text.includes("channel") || text.includes("artist") || text.includes("seite"));
      });
      if (urlEl && youtubeValue) {
        if (urlEl.value === youtubeValue) note("youtube-url", "already", youtubeValue, urlEl.value, null);
        else if (setValue(urlEl, youtubeValue)) note("youtube-url", "filled", youtubeValue, urlEl.value, null);
        else note("youtube-url", "mismatch", youtubeValue, urlEl.value, null);
      } else if (!plan.mappings.youtubeUrl) note("youtube-url", "no-data", null, null, null);
      else note("youtube-url", "not-found", plan.mappings.youtubeUrl, null, null);
    }
    if (plan.mappings.appleUrl) {
      setRadioDecision("apple-mapping", /^appleArtistID/i, ["apple music", "itunes"], [["es gibt eine Seite"], ["ja - gruppiere"], ["group"]], null);
      await sleep(300);
      const urlEl = Array.from(document.querySelectorAll('input[type="text"], input:not([type])')).find((input) => {
        if (isForbidden(input)) return false;
        const ph = (input.getAttribute("placeholder") || "").toLowerCase();
        if (ph.includes("music.apple.com")) return true;
        const text = norm(labelText(input));
        return (text.includes("apple") || text.includes("itunes")) && (text.includes("url") || text.includes("link") || text.includes("artist"));
      });
      if (urlEl) {
        if (urlEl.value === plan.mappings.appleUrl) note("apple-mapping-url", "already", plan.mappings.appleUrl, urlEl.value, null);
        else if (setValue(urlEl, plan.mappings.appleUrl)) note("apple-mapping-url", "filled", plan.mappings.appleUrl, urlEl.value, null);
        else note("apple-mapping-url", "mismatch", plan.mappings.appleUrl, urlEl.value, null);
      } else note("apple-mapping-url", "not-found", plan.mappings.appleUrl, null, null);
    } else {
      note("apple-mapping", "no-data", null, null, null);
      note("apple-mapping-url", "no-data", null, null, null);
    }
    for (const track of plan.tracks) {
      const index = track.index;
      const selector = '.uploadFileTitle[tracknum="' + index + '"], input[tracknum="' + index + '"][name^="title_"], input[tracknum="' + index + '"][id^="title_"]';
      const placeholder = 'input[placeholder="Track ' + index + ' title"], input[placeholder="Track ' + index + ' Titel"]';
      const titleEl = findControl(selector) || findControl(placeholder);
      const fieldId = "track-title-" + index;
      if (!titleEl) note(fieldId, "not-found", track.title, null, index);
      else if (titleEl.value === track.title) note(fieldId, "already", track.title, track.title, index);
      else if (setValue(titleEl, track.title)) note(fieldId, "filled", track.title, titleEl.value, index);
      else note(fieldId, "mismatch", track.title, titleEl.value, index);
      setRadioDecision("explicit-lyrics-" + index, /^explicit_/i, ["explicit lyrics", "explicit content", "explizite"], [["nein"], ["no"], ["clean"]], index);
      setRadioDecision("radio-edit-" + index, /^cleaned_/i, ["radio edit", "radiofassung"], [["nein - dieser song ist clean"], ["nein"], ["no"], ["not a radio edit"]], index);
      {
        const instrumentalTiers = plan.instrumental
          ? [["instrumental und hat keine lyrics"], ["instrumental und keine lyrics"], ["ist instrumental"], ["instrumental"], ["hat keine lyrics"]]
          : [["hat lyrics"], ["dieser song hat lyrics"], ["contains lyrics"], ["nein"], ["no"]];
        setRadioDecision("instrumental-" + index, /^instrumental_/i, ["instrumental"], instrumentalTiers, index);
      }
      setRadioDecision("cover-song-" + index, /^coversong_/i, ["cover song", "is this a cover", "ist dies ein cover"], [["selbst geschrieben"], ["original"], ["nein"], ["no"]], index);
      setRadioDecision("featured-artist-" + index, /^feat_/i, ["featured artist", "gastmusiker"], [["nein, keine"], ["nein"], ["no"]], index);
      setRadioDecision("version-info-" + index, /^version_/i, ["version info", "versionsinfo"], [["nein, das ist"], ["nein"], ["no"]], index);
      setRadioDecision("dolby-atmos-" + index, /^dolby_/i, ["dolby", "atmos", "spatial"], [["nein"], ["no"]], index);
      setRadioDecision("ai-music-" + index, /^ai_gate_/i, ["ai-generated", "ki-generierte"], [["nein"], ["no"]], index);
      const trackAudio = "#js-track-upload-" + index;
      if (document.querySelector(trackAudio)) markFileInput(trackAudio, "audio-" + index);
      if (plan.songwriter) {
        const legal = [plan.songwriter.firstName, plan.songwriter.middleName, plan.songwriter.lastName].filter(Boolean).join(" ");
        const firstEl = findControl('input[name="songwriter_real_name_first' + index + '"], input.songwriter_real_name_first[tracknum="' + index + '"]');
        if (firstEl) {
          fillTextById("songwriter-first-" + index, 'input[name="songwriter_real_name_first' + index + '"], input.songwriter_real_name_first[tracknum="' + index + '"]', plan.songwriter.firstName);
          if (plan.songwriter.middleName) fillTextById("songwriter-middle-" + index, 'input[name="songwriter_real_name_middle' + index + '"], input.songwriter_real_name_middle[tracknum="' + index + '"]', plan.songwriter.middleName);
          fillTextById("songwriter-last-" + index, 'input[name="songwriter_real_name_last' + index + '"], input.songwriter_real_name_last[tracknum="' + index + '"]', plan.songwriter.lastName);
          note("songwriter-" + index, "filled", legal, legal, index);
        } else {
          note("songwriter-" + index, "not-found", legal, null, index);
        }
      } else {
        const songwriterFirst = '.songwriter_real_name_first[tracknum="' + index + '"], input[name="songwriter_real_name_first' + index + '"]';
        if (document.querySelector(songwriterFirst)) note("songwriter-" + index, "no-data", null, null, index);
      }
    }
    markFileInput("#artwork", "artwork");
    for (let index = 1; index <= plan.tracks.length; index += 1) {
      if (!document.querySelector('input[data-mam-dk="audio-' + index + '"]')) note("audio-file-" + index, "not-found", plan.tracks[index - 1].title, null, index);
      else note("audio-file-" + index, "filled", plan.tracks[index - 1].title, "marked", index);
    }
    if (plan.fileCount.artwork) {
      if (document.querySelector('input[data-mam-dk="artwork"]')) note("artwork", "filled", "marked", "marked", null);
      else note("artwork", "not-found", "marked", null, null);
    } else note("artwork", "no-data", null, null, null);
  };
  await detectState();
  if (report.loginRequired || !report.formDetected) return report;
  try {
    await applyStages();
  } catch (error) {
    report.fields.push({ id: "__script-error", track: null, status: "error", expected: null, actual: String(error && error.message ? error.message : error) });
  }
  return report;
})()`;
}

export function buildDistroKidFileVerifyScript(): string {
  return `(() => {
  const inputs = Array.from(document.querySelectorAll('input[data-mam-dk][type="file"]'));
  return inputs.map((input) => {
    const token = input.getAttribute("data-mam-dk");
    const file = input.files && input.files[0] ? input.files[0] : null;
    return { token, fileName: file ? file.name : null, count: input.files ? input.files.length : 0 };
  });
})()`;
}

export function composeDistroKidFillResult(page: DistroKidPageReport | null, files: DistroKidFileReport[]): DistroKidFillResult {
  if (page && page.loginRequired) {
    return {
      ok: false,
      filledFields: 0,
      message: "Sign in to DistroKid in the open window, then run Fill form again.",
      loginRequired: true,
      fields: page.fields,
      files,
    };
  }
  if (!page || !page.formDetected) {
    return {
      ok: false,
      filledFields: 0,
      message: "DistroKid upload form not found. Open the upload window, sign in, load the form, then try again.",
      loginRequired: page?.loginRequired ?? false,
      fields: page?.fields ?? [],
      files,
    };
  }
  const filled = page.fields.filter((field) => field.status === "filled" || field.status === "already").length;
  const filesAttached = files.filter((file) => file.status === "attached").length;
  const filesAttempted = files.length;
  const manual = page.fields.filter((field) => field.status === "no-data").map((field) => field.id);
  const parts = [`Filled ${filled} field${filled === 1 ? "" : "s"} from MAM.`];
  if (filesAttempted > 0) parts.push(`Files: ${filesAttached}/${filesAttempted} attached.`);
  if (manual.length) parts.push(`Left for you: ${manual.join(", ")}.`);
  parts.push("Review every field — nothing is submitted automatically.");
  return {
    ok: filled > 0 || filesAttached > 0,
    filledFields: filled,
    message: parts.join(" "),
    loginRequired: false,
    fields: page.fields,
    files,
  };
}

export function mapUploadTargets(payload: DistroKidFormPayload): Array<{ kind: "artwork" | "audio"; track: number | null; selector: string; filePath: string; fileName: string }> {
  const targets: Array<{ kind: "artwork" | "audio"; track: number | null; selector: string; filePath: string; fileName: string }> = [];
  if (payload.artworkFilePath) {
    targets.push({ kind: "artwork", track: null, selector: DISTROKID_SELECTORS.fileMarker("artwork"), filePath: payload.artworkFilePath, fileName: payload.coverFileName ?? "artwork" });
  }
  payload.audioFiles.forEach((file, index) => {
    targets.push({ kind: "audio", track: index + 1, selector: DISTROKID_SELECTORS.fileMarker("audio-" + (index + 1)), filePath: file.filePath, fileName: file.fileName });
  });
  return targets;
}

export function toFieldReports(pageFields: DistroKidPageField[]): DistroKidFieldReport[] {
  return pageFields.map((field) => ({ id: field.id, track: field.track, status: field.status, expected: field.expected, actual: field.actual }));
}
