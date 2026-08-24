const brandDefaults = {
  hashtags: ["#psytrance", "#progressivepsytrance", "#darkpsy", "#thearkadiusz", "#consciousmusic", "#aimusic", "#sacredgeometry"],
  weeklyThemes: {
    Monday: "Studio photo + production tip",
    Tuesday: "Psytrance history",
    Wednesday: "Behind the scenes",
    Thursday: "DJ setup",
    Friday: "New music teaser",
    Saturday: "Festival memories",
    Sunday: "Inspirational post"
  }
};

const channels = {
  Instagram: ({ title, artist, genre, bpm, story, date, style, tags }) =>
    `New transmission incoming: ${title}\n\n${story}\n\n${genre} energy at ${bpm} BPM. Release date: ${date}.\n\nFor listeners who like ${style} journeys through rhythm, space, and consciousness.\n\n${tags.slice(0, 6).join(" ")}`,
  Facebook: ({ title, artist, genre, bpm, story, date, tags }) =>
    `${artist} presents ${title}.\n\nThis track was born from:\n${story}\n\nRelease date: ${date}\nGenre: ${genre}\nBPM: ${bpm}\n\nThank you for being part of the journey. ${tags.slice(0, 4).join(" ")}`,
  TikTok: ({ title, bpm, tags }) =>
    `${title} is coming. ${bpm} BPM ritual pressure for the dancefloor. Which drop should I preview next? ${tags.slice(0, 5).join(" ")}`,
  SoundCloud: ({ title, artist, genre, bpm, story, date }) =>
    `${title} by ${artist}\n\n${story}\n\nGenre: ${genre}\nBPM: ${bpm}\nRelease date: ${date}\n\nFollow for more cosmic, tribal, high-tech psychedelic music.`,
  YouTube: ({ title, artist, genre, bpm, story, date, tags }) =>
    `${artist} - ${title}\n\n${story}\n\nRelease date: ${date}\nStyle: ${genre}\nTempo: ${bpm} BPM\n\nSubscribe for visualizers, DJ clips, studio sessions, and new psychedelic releases.\n\n${tags.join(" ")}`,
  "Spotify Canvas": ({ title }) =>
    `Canvas ideas for ${title}:\n1. Rotating sacred-geometry portal synced to the kick.\n2. Amazonian leaf textures dissolving into stars.\n3. Neon waveform moving through a ritual mask silhouette.\n4. AI-generated fractal tunnel with tribal pulse flashes.`,
  LinkedIn: ({ title, artist, story }) =>
    `${artist}'s next release, ${title}, explores how electronic music can connect technology, ritual, and emotional storytelling.\n\nCreative note: ${story}\n\nThis campaign will combine AI-assisted copy, short-form video, image generation, and analytics-led scheduling.`,
  X: ({ title, genre, bpm, date, tags }) =>
    `${title} arrives ${date}.\n\n${genre}. ${bpm} BPM. Cosmic tribal pressure for the psychedelic floor.\n\n${tags.slice(0, 3).join(" ")}`,
  Telegram: ({ title, artist, date }) =>
    `ARK family, new music is on the way.\n\n${artist} - ${title}\nRelease date: ${date}\n\nI will share previews, artwork, and the first visual teaser here before everywhere else.`,
  Discord: ({ title, story }) =>
    `New release channel update:\n\nTrack: ${title}\nStory: ${story}\n\nDrop your thoughts, artwork reactions, and teaser ideas. Best suggestions can become part of the campaign.`
};

const studioModules = [
  ["Release Manager", "Turns song metadata into platform-ready release copy."],
  ["Content Creator", "Builds daily post ideas and 30-day campaigns."],
  ["Image Generator", "Creates artwork prompts for banners, teasers, flyers, and thumbnails."],
  ["Video Generator", "Plans short-form clips from cover art, music, lyrics, waveforms, and AI visuals."],
  ["Social Media Manager", "Schedules, adapts, and organizes publishing across channels."],
  ["Website Manager", "Prepares release-page updates, embeds, press sections, and news posts."],
  ["Analytics", "Reads performance data and recommends the next move."],
  ["Fan Engagement", "Suggests on-brand replies for comments and DMs before approval."],
  ["Trend Hunter", "Watches hashtags, sounds, festival news, competitors, and AI music topics."],
  ["Booking Assistant", "Drafts outreach for festivals, clubs, radio shows, and podcasts."],
  ["Email Assistant", "Creates newsletter copy, release announcements, and fan updates."],
  ["Label Manager", "Tracks demo submissions, metadata, assets, rights, and release status."],
  ["Knowledge Database", "Stores artist identity, genres, voice, visuals, story, and audience memory."]
];

const imageIdeas = [
  "Instagram square: sacred geometry portal over Amazonian canopy",
  "Story image: vertical neon waveform with release countdown",
  "Facebook banner: artist name, title, ritual-tech visual language",
  "YouTube thumbnail: cover artwork plus high-contrast title lockup",
  "Event flyer: dark dancefloor, fractal canopy, clean date block",
  "Quote card: short consciousness-focused line from the track story",
  "Wallpaper: cosmic tribal pattern with subtle ARK mark",
  "Release teaser: cover art fragment with BPM and release date"
];

const videoIdeas = [
  "TikTok: cover artwork animated into a bass-synced waveform",
  "Reels: 12-second fractal tunnel with kick-driven light pulses",
  "Shorts: lyrics or mantra text appearing over psychedelic geometry",
  "Visualizer: AI-generated clips blended with waveform and spectrum",
  "Teaser: 5-second drop preview with title reveal at the end"
];

const schedule = [
  ["Monday 10:00", "Instagram", "Studio photo + production tip"],
  ["Monday 11:00", "Facebook", "Long-form release story"],
  ["Monday 16:00", "TikTok", "Drop teaser caption"],
  ["Tuesday 18:00", "YouTube Community", "Artwork poll"],
  ["Wednesday 20:00", "SoundCloud", "Private preview description"]
];

const trendPool = [
  {
    trend: "People are talking about AI mastering today.",
    suggestion: "Post a studio note about where AI helps the workflow and where human taste still makes the final call."
  },
  {
    trend: "Ozora Festival is trending.",
    suggestion: "Share a festival-memory post connected to the new track's tribal percussion and open-air dancefloor energy."
  },
  {
    trend: "Psytrance reels with waveform overlays are performing well.",
    suggestion: "Create a 9:16 clip using the cover artwork, waveform, and the first bassline entrance."
  },
  {
    trend: "Artists are posting DJ setup walkthroughs.",
    suggestion: "Show the exact synth, plugin, or controller used for the track's main texture."
  }
];

const analytics = [
  ["Follower growth", "+6.8% projected after teaser week"],
  ["Best post type", "Studio clips with clear sound preview"],
  ["Best posting time", "Monday 10:00 and Friday 18:00"],
  ["Engagement rate", "Target 5.2% for release week"],
  ["Top hashtags", "#psytrance, #aimusic, #sacredgeometry"],
  ["Next action", "Turn the track story into 3 short video hooks"]
];

const businessAssistants = [
  ["Booking Assistant", "Festival pitch: introduce the live/DJ project, highlight psychedelic identity, include links, and ask for suitable 2026 slots."],
  ["Email Assistant", "Newsletter: announce the new track, share the story, add pre-save/listen links, and invite fans into the next preview."],
  ["Label Manager", "Release checklist: audio master, cover art, ISRC, credits, distribution date, social assets, visualizers, and promo calendar."]
];

const websiteTasks = [
  ["Release page", "Add artwork, streaming links, description, genre, BPM, release date, and visualizer embed."],
  ["Homepage", "Feature the new track as the main update with one strong call to listen or pre-save."],
  ["Press kit", "Update artist bio, selected images, genre tags, and campaign copy for promoters."],
  ["News post", "Publish the story behind the track with production notes and social embeds."]
];

const knowledgeResearch = [
  {
    title: "Primary Success Cause: Scene Belonging",
    insight: "Successful psytrance promotion sells entry into a living culture, not just a track. The strongest campaigns connect music to outdoor gatherings, ritual dance, visual art, sustainability, spiritual language, and international community. Boom and Ozora show that psytrance audiences respond to an immersive worldview: nature, transformation, art, dance, and consciousness.",
    apply: "For The Arkadiusz, every release should answer: what world does this track open? Use Amazonian, cosmic, sacred-geometry, and AI-consciousness language consistently across cover, captions, video, website, and fan replies.",
    action: "Create one campaign sentence before writing posts: 'This release is a ritual-tech journey where [sound] meets [place/vision] for [emotional transformation].'"
  },
  {
    title: "Primary Success Cause: Repeatable Audio Moment",
    insight: "Short-form music discovery rewards a clear moment people can remember, reuse, or react to: a bassline entrance, vocal/mantra hook, drop, unusual texture, or visual sync point. TikTok, Reels, and Shorts work best when the music gives creators a specific reason to use the sound.",
    apply: "Cut 3 micro-hooks from each track: 7 seconds for instant impact, 15 seconds for reel energy, and 30 seconds for deeper visualizer clips. Psytrance can use the first kick/bass lock, first psychedelic lead, and strongest breakdown-to-drop transition.",
    action: "Before release day, create 9 vertical clips: 3 hooks x 3 visual treatments."
  },
  {
    title: "Primary Success Cause: Playlist + Metadata Readiness",
    insight: "Streaming success depends on being legible to editorial and algorithmic systems: genre, mood, similar audience, clean metadata, artwork quality, release timing, and early engagement. Playlist pitching is not magic, but it helps when the track identity is specific and the campaign creates saves, follows, playlist adds, and repeat listening.",
    apply: "Pitch The Arkadiusz tracks with precise descriptors: Psytrance, Progressive Psytrance, Dark Psy, tribal percussion, cosmic leads, spiritual atmosphere, festival/open-air energy, AI/futurist sound design.",
    action: "Submit playlist pitches at least 7 days before release, then push pre-saves and first-week saves with a clear fan request."
  },
  {
    title: "Primary Success Cause: Visual Universe",
    insight: "Cover art is a discovery gateway. Research on audio-guided album-cover generation and modern music platforms supports the idea that cover visuals should reflect both the artist identity and the track's sonic character. For psytrance, visual consistency matters because the scene is already linked to visionary art, fractals, sacred geometry, nature, and altered perception.",
    apply: "Use a consistent ARK visual grammar: sacred geometry center object, cosmic depth, Amazonian/tribal organic detail, high-tech light, strong square composition, readable title/artist system, and one accent color per release.",
    action: "Generate 4 cover directions for every release: Ritual Nature, Cosmic Machine, Sacred Portal, Dark Forest."
  },
  {
    title: "Primary Success Cause: Community Proof",
    insight: "Psytrance grows through trust: DJs, collectives, festivals, niche labels, Telegram/Discord groups, YouTube visualizer channels, SoundCloud repost networks, and repeat event culture. The campaign should show real participation rather than only broadcast promotion.",
    apply: "Ask DJs and fans small, specific questions: which drop should be teased, which artwork version feels strongest, which festival would this fit, which part of the journey hit hardest.",
    action: "Run one community input post per week and turn replies into follow-up content."
  },
  {
    title: "Primary Success Cause: Direct-to-Fan Safety Net",
    insight: "Social platforms change quickly and can remove music, reduce reach, or push artists into paid systems. Strong campaigns use social discovery but also move listeners to owned channels: email list, website, Bandcamp, Telegram, Discord, and Spotify/YouTube follows.",
    apply: "Every campaign should have one direct-fan call to action: join the ARK signal list, enter Telegram/Discord, pre-save, follow Spotify, or watch the full visualizer on YouTube.",
    action: "Do not let TikTok/Reels be the destination. Use them as doors into the ARK ecosystem."
  },
  {
    title: "Cover Art Rule: Streaming Compliance First",
    insight: "Distributors and platforms commonly reject artwork that is low quality, not square, contains URLs, QR codes, social logos, streaming logos, prices, or unlicensed/stock imagery. DistroKid recommends square JPG artwork, ideally 3000 x 3000 pixels, RGB color, and one image file.",
    apply: "Create master cover art at 3000 x 3000 JPG/RGB. Keep the official cover clean: no website, no QR, no social handles, no Spotify/Apple logos, no flyer-style dates.",
    action: "Make promotional variants separately: story poster, reel frame, YouTube thumbnail, event flyer, and banner."
  },
  {
    title: "Cover Art Rule: Small-Screen Recognition",
    insight: "Album art is often seen as a tiny square in feeds, playlists, and streaming apps. Complex psychedelic detail can be powerful, but the cover still needs a dominant shape, clear contrast, and a recognizable focal point.",
    apply: "Use one main symbol per release: portal, mask, signal, eye, temple, planet, serpent, waveform, or sacred mandala. Keep secondary detail around it.",
    action: "Test every cover at 64 px, 300 px, and full size before approving it."
  },
  {
    title: "Art System: One Release, Many Assets",
    insight: "The cover is only the root asset. Successful campaigns adapt the same visual universe into vertical video, story graphics, banners, quote cards, Spotify Canvas, YouTube thumbnail, SoundCloud header, and website hero art.",
    apply: "For each release, generate a visual kit: master cover, clean background, transparent title lockup, vertical teaser, waveform frame, Canvas loop, YouTube thumbnail, and press image.",
    action: "Never create one-off art. Create a reusable campaign kit from the same world."
  }
];

const researchSources = [
  ["Boom Festival culture", "https://en.wikipedia.org/wiki/Boom_Festival"],
  ["Psytrance festival culture", "https://en.wikipedia.org/wiki/Psychedelic_trance"],
  ["TikTok impact on music demand", "https://arxiv.org/abs/2405.14999"],
  ["TikTok song re-popularization", "https://arxiv.org/abs/2411.01239"],
  ["YouTube Shorts engagement research", "https://arxiv.org/abs/2403.00454"],
  ["Spotify chart success features", "https://arxiv.org/abs/2508.11632"],
  ["Audio-guided cover art generation", "https://arxiv.org/abs/2207.07162"],
  ["Music2P album cover design", "https://arxiv.org/abs/2408.01651"],
  ["DistroKid artwork requirements", "https://support.distrokid.com/hc/en-us/articles/360013534334-What-Are-the-Requirements-for-Album-Artwork"],
  ["Apple Music style guide", "https://help.apple.com/itc/musicstyleguide/en.lproj/static.html"]
];

const pageMeta = {
  release: ["Release Manager", "Upload a new song, define metadata, and generate platform copy."],
  content: ["Content Creator", "Build a focused 30-day content calendar for the release."],
  visuals: ["Image + Video", "Plan the artwork, teaser graphics, Canvas concepts, and short-form clips."],
  schedule: ["Social Media Manager", "Organize channel timing without mixing it into the creative pages."],
  website: ["Website Manager", "Prepare release-page, homepage, press-kit, and news updates."],
  engagement: ["Fan Engagement", "Turn comments and DMs into approved, on-brand replies."],
  trends: ["Trend Hunter", "Find the current cultural angle for the next post."],
  analytics: ["Analytics", "Read performance signals and choose the next campaign move."],
  business: ["Booking + Label", "Handle festival outreach, newsletters, and label/release operations."],
  memory: ["Knowledge Database", "Edit the artist identity that all modules should remember."],
  knowledge: ["Knowledge Module", "Use researched psytrance promotion intelligence for future campaigns."]
};

function $(id) {
  return document.getElementById(id);
}

function switchPage(pageId, updateHash = true) {
  const targetPage = pageMeta[pageId] ? pageId : "release";
  document.querySelectorAll("[data-page]").forEach((page) => {
    page.classList.toggle("is-active", page.dataset.page === targetPage);
  });
  document.querySelectorAll("[data-page-link]").forEach((link) => {
    const isActive = link.dataset.pageLink === targetPage;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
  $("pageEyebrow").textContent = pageMeta[targetPage][0];
  $("pageTitle").textContent = pageMeta[targetPage][1];
  if (updateHash && window.location.hash !== `#${targetPage}`) {
    history.pushState(null, "", `#${targetPage}`);
  }
}

function getInputs() {
  const tags = brandDefaults.hashtags;
  return {
    title: $("trackTitle").value.trim() || "Untitled Transmission",
    artist: $("artist").value.trim() || "The Arkadiusz",
    genre: $("genre").value,
    bpm: $("bpm").value || "145",
    story: $("story").value.trim(),
    date: formatDate($("releaseDate").value),
    style: $("styleWords").value.split(",").map((word) => word.trim()).filter(Boolean).slice(0, 5).join(", "),
    voice: $("voice").value.trim(),
    tags
  };
}

function formatDate(value) {
  if (!value) return "TBA";
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function renderCopy() {
  const channel = $("copyChannel").value;
  const input = getInputs();
  $("copyOutput").textContent = channels[channel](input);
}

function renderCalendar() {
  const calendar = $("calendarGrid");
  const input = getInputs();
  const days = Object.entries(brandDefaults.weeklyThemes);
  calendar.innerHTML = "";
  for (let i = 0; i < 30; i += 1) {
    const [day, theme] = days[i % days.length];
    const card = document.createElement("article");
    card.className = "calendar-card";
    card.innerHTML = `<span class="eyebrow">Day ${i + 1} - ${day}</span><strong>${theme}</strong><p>${makeContentIdea(theme, input)}</p>`;
    calendar.appendChild(card);
  }
}

function makeContentIdea(theme, input) {
  if (theme.includes("Studio")) return `Share one production choice from ${input.title}, then ask fans what sound they want isolated.`;
  if (theme.includes("history")) return `Connect classic ${input.genre} culture to the track's ${input.bpm} BPM ritual drive.`;
  if (theme.includes("Behind")) return `Show a raw project-screen moment and explain how the story became sound.`;
  if (theme.includes("DJ")) return `Feature one setup element that helps test the track for real dancefloor impact.`;
  if (theme.includes("teaser")) return `Post a short drop preview with one line: "${input.title} is opening the portal."`;
  if (theme.includes("Festival")) return `Pair a festival memory with why open-air systems shaped this track.`;
  return `Share a short reflection about consciousness, rhythm, and intentional listening.`;
}

function renderLists() {
  $("moduleMap").innerHTML = studioModules.map(([name, detail]) => `<article class="module-node"><strong>${name}</strong><span>${detail}</span></article>`).join("");
  $("imageIdeas").innerHTML = imageIdeas.map((idea) => `<li>${idea}</li>`).join("");
  $("videoIdeas").innerHTML = videoIdeas.map((idea) => `<li>${idea}</li>`).join("");
  $("scheduleList").innerHTML = schedule.map(([time, channel, detail]) => `<div class="schedule-item"><strong>${time}</strong><br>${channel}: ${detail}</div>`).join("");
  $("analyticsGrid").innerHTML = analytics.map(([label, value]) => `<div class="analytics-item"><strong>${label}</strong>${value}</div>`).join("");
  $("businessGrid").innerHTML = businessAssistants.map(([label, value]) => `<div class="business-item"><strong>${label}</strong>${value}</div>`).join("");
  $("websiteList").innerHTML = websiteTasks.map(([label, value]) => `<div class="website-item"><strong>${label}</strong>${value}</div>`).join("");
  $("knowledgeGrid").innerHTML = knowledgeResearch.map((item) => `<article class="knowledge-card"><strong>${item.title}</strong><p>${item.insight}</p><p><b>Apply:</b> ${item.apply}</p><p><b>Action:</b> ${item.action}</p></article>`).join("");
  $("sourceList").innerHTML = `<strong>Research sources used by this module</strong>${researchSources.map(([label, url]) => `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`).join("")}`;
}

function applyKnowledge() {
  const input = getInputs();
  const campaignLine = `This release is a ritual-tech ${input.genre} journey where ${input.story || "cosmic sound design"} meets ${input.style || "sacred geometry"} at ${input.bpm} BPM.`;
  const coverPrompt = `Square 3000x3000 album cover for ${input.artist} - ${input.title}. Psytrance, ${input.genre}, ${input.style}. One dominant sacred-geometry portal, Amazonian organic textures, high-tech cosmic light, strong contrast, readable at thumbnail size, no logos, no URL, no QR code, no social icons.`;
  const checklist = [
    "Pick the strongest 7s, 15s, and 30s audio moments before writing captions.",
    "Create four cover directions: Ritual Nature, Cosmic Machine, Sacred Portal, Dark Forest.",
    "Build the visual kit from one world: cover, vertical teaser, Canvas loop, thumbnail, banner, quote card.",
    "Pitch playlists with precise mood and scene language: open-air, tribal, cosmic, spiritual, high-tech.",
    "Use one fan question in the first week: Which part of the journey should become the next visual?",
    "Move attention from social into owned channels: website, email list, Telegram or Discord."
  ];

  $("knowledgeApplication").innerHTML = `
    <strong>Applied Campaign Memory for ${input.title}</strong>
    <p>${campaignLine}</p>
    <p><b>Cover prompt:</b> ${coverPrompt}</p>
    <ul>${checklist.map((item) => `<li>${item}</li>`).join("")}</ul>
  `;
}

function suggestReply() {
  const comment = $("fanComment").value.trim().toLowerCase();
  const input = getInputs();
  let reply = `Thank you! Really happy you're enjoying it. More music is on the way.`;
  if (comment.includes("favorite") || comment.includes("love")) {
    reply = `Thanks for listening. That means a lot. Which moment in ${input.title} connected with you the most?`;
  } else if (comment.includes("amazing") || comment.includes("great")) {
    reply = `Thank you! Really happy you're feeling the energy. More ${input.genre} journeys are coming soon.`;
  } else if (comment.includes("?")) {
    reply = `Good question. I will share more about the process behind ${input.title} in the next studio post.`;
  }
  $("replyBox").textContent = reply;
}

function huntTrend() {
  const input = getInputs();
  const pick = trendPool[Math.floor(Math.random() * trendPool.length)];
  $("trendBox").textContent = `${pick.trend}\n\nSuggested ARK post:\n${pick.suggestion}\n\nHook: "${input.title} was built where ritual percussion meets future sound design."`;
}

function generateAll() {
  renderCopy();
  renderCalendar();
  suggestReply();
  huntTrend();
  applyKnowledge();
}

document.addEventListener("DOMContentLoaded", () => {
  renderLists();
  generateAll();
  document.querySelectorAll("[data-page-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      switchPage(link.dataset.pageLink);
    });
  });
  window.addEventListener("hashchange", () => {
    switchPage(window.location.hash.slice(1), false);
  });
  switchPage(window.location.hash.slice(1) || "release", false);
  $("generateRelease").addEventListener("click", renderCopy);
  $("copyChannel").addEventListener("change", renderCopy);
  $("generateCalendar").addEventListener("click", renderCalendar);
  $("suggestReply").addEventListener("click", suggestReply);
  $("huntTrend").addEventListener("click", huntTrend);
  $("applyKnowledge").addEventListener("click", applyKnowledge);
  $("generateAll").addEventListener("click", generateAll);
  ["trackTitle", "releaseDate", "genre", "bpm", "story", "artist", "styleWords", "voice"].forEach((id) => {
    $(id).addEventListener("input", () => {
      renderCopy();
      applyKnowledge();
    });
  });
});
