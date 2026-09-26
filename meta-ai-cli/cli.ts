import { Command } from "jsr:@cliffy/command@^1.0.0-rc.8";
import { fromFileUrl } from "jsr:@std/path@^1.1.2";
import denoConfig from "./deno.json" with { type: "json" };
import { downloadFile } from "./lib/download.ts";
import { downloadGeneratedImage } from "./lib/image_download.ts";
import {
  clearHistoryContent,
  collectHistoryInventory,
  downloadHistoryInventory,
} from "./lib/history.ts";
import {
  type AspectRatio,
  type CompletedVideo,
  type GeneratedImage,
  type GeneratedVideo,
  MetaAiClient,
} from "./lib/meta_api.ts";
import { formatOutput } from "./lib/output.ts";
import {
  DEFAULT_SESSION_PATH,
  planNumberedOutputs,
  resolvePath,
} from "./lib/paths.ts";
import {
  checkPlaywrightCliDependencies,
  closePlaywrightCliSession,
  generatePlaywrightCliSessionName,
  gotoPlaywrightCliSession,
  loadPlaywrightCliState,
  openPlaywrightCliSession,
  runPlaywrightCliCodeJson,
  savePlaywrightCliState,
} from "./lib/playwright_cli.ts";
import {
  hasMetaSessionCookie,
  loadStorageState,
  saveStorageState,
  type StorageState,
} from "./lib/session.ts";

type RootOptions = {
  json?: boolean;
  sessionPath?: string;
};

type LoginOptions = RootOptions & {
  url?: string;
};

type ImageCreateOptions = RootOptions & {
  prompt: string;
  imageOut: string;
  videoOut?: string;
  animate?: boolean | string;
  aspect?: string;
  count?: number;
  extend?: number;
};

type VideoCreateOptions = RootOptions & {
  prompt: string;
  videoOut: string;
  aspect?: string;
  extend?: number;
};

type HistoryDownloadOptions = RootOptions & {
  out: string;
  delete?: boolean;
};

type HistoryClearOptions = RootOptions & {
  force?: boolean;
};

type ImageDownloadResult = {
  index: number;
  id: string;
  url: string;
  thumbnail: string | null;
  downloadableFileName: string | null;
  path: string;
  bytes: number;
  contentType: string | null;
};

type AnimationResult = {
  imageIndex: number;
  prompt: string;
  finalVideo: {
    id: string;
    url: string;
    path: string;
    bytes: number;
    contentType: string | null;
    downloadableFileName: string | null;
  };
  lineage: Array<{
    step: string;
    id: string;
    url: string;
    status: string;
  }>;
};

type FrontendImageCreateResult = {
  ok: boolean;
  reason?: string;
  conversationId?: string | null;
  images?: Array<{
    url: string;
    thumbnail?: string | null;
    fileName?: string | null;
  }>;
};

type FrontendVideoCreateResult = {
  ok: boolean;
  reason?: string;
  conversationId?: string | null;
  videos?: Array<{
    url: string;
    thumbnail?: string | null;
  }>;
};

const VERSION = denoConfig.version;
const MUTATION_PAUSE_MS = 5_000;
const MUTATION_PAUSE_JITTER_MS = 2_000;
const LOGIN_POLL_INTERVAL_MS = 1_000;
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const FRONTEND_IMAGE_TIMEOUT_MS = 5 * 60 * 1000;
const FRONTEND_IMAGE_STABLE_MS = 10_000;
const FRONTEND_VIDEO_VARIANT_COUNT = 4;

export async function loginCommand(options: LoginOptions): Promise<void> {
  const sessionPath = resolveSessionPath(options.sessionPath);
  const url = options.url ?? "https://meta.ai/create";
  await ensurePlaywrightCliReady();
  const state = await runLoginBootstrapWithPlaywrightCli(url);

  if (!hasMetaSessionCookie(state)) {
    throw new Error(
      "A Meta session cookie was not captured. Login may not be complete.",
    );
  }

  const savedPath = await saveStorageState(state, sessionPath);
  const cookieCount =
    state.cookies.filter((cookie) =>
      cookie.domain.includes("meta.ai") && cookie.value.length > 0
    ).length;
  const result = {
    ok: true,
    command: "auth login",
    sessionPath: savedPath,
    cookieCount,
    message: `Saved Meta session to ${savedPath}`,
  };

  emitResult(result, options.json);
}

export async function imageCreateCommand(
  options: ImageCreateOptions,
): Promise<void> {
  const prompt = options.prompt;
  const outputImage = options.imageOut;
  const outputVideo = options.videoOut;
  const animationPrompt = normalizeAnimatePrompt(options.animate);
  const aspect = parseAspectRatio(options.aspect, true);
  const count = options.count ?? 1;
  const animate = animationPrompt !== undefined;
  const extendCount = options.extend ?? 0;

  if (!Number.isInteger(count) || count < 1 || count > 4) {
    throw new Error("--count must be an integer between 1 and 4 for frontend generation.");
  }

  if (animate && !outputVideo) {
    throw new Error(
      "image create --animate also requires --video-out so the animated result can be downloaded.",
    );
  }

  if (!animate && outputVideo) {
    throw new Error("image create --video-out requires --animate.");
  }

  if (!animate && extendCount > 0) {
    throw new Error("image create --extend requires --animate.");
  }

  const resolvedSessionPath = resolveSessionPath(options.sessionPath);
  const { state } = await loadStorageState(resolvedSessionPath);

  const createResult = await createImageWithFrontend(
    resolvedSessionPath,
    prompt,
    aspect,
    count,
  );

  const client = new MetaAiClient(state);
  const images = ensureUrls(
    createResult.images,
    "image",
    undefined,
  );
  const imageDownloads = await downloadImages(client, images, outputImage);
  let animationResults: AnimationResult[] = [];

  if (animate) {
    animationResults = await createImageAnimations(
      client,
      resolvedSessionPath,
      images,
      {
        animationPrompt,
        conversationId: createResult.conversationId ?? "",
        extendCount,
        outputVideo: outputVideo!,
      },
    );
  }

  const result = {
    ok: true,
    command: "image create",
    sessionPath: resolvedSessionPath,
    prompt,
    aspect,
    count,
    conversationId: createResult.conversationId,
    animated: animate,
    extendCount,
    images: imageDownloads,
    animation: animate
      ? {
        prompt: animationPrompt,
        videos: animationResults,
      }
      : null,
    message: animate
      ? `Saved ${imageDownloads.length} image(s) and ${animationResults.length} video(s).`
      : `Saved ${imageDownloads.length} image(s).`,
  };

  emitResult(result, options.json);
}

export async function videoCreateCommand(
  options: VideoCreateOptions,
): Promise<void> {
  const prompt = options.prompt;
  const outputVideo = options.videoOut;
  const aspect = parseAspectRatio(options.aspect, false);
  const extendCount = options.extend ?? 0;

  if (extendCount > 0) {
    throw new Error(
      "video create --extend is temporarily unavailable because Meta moved video generation to its frontend transport.",
    );
  }

  const { client, sessionPath } = await createClient(options.sessionPath);
  const createResult = await createVideoWithFrontend(
    sessionPath,
    prompt,
    aspect,
  );
  const createdVideos = createResult.videos;
  const videoPaths = await planNumberedOutputs(
    outputVideo,
    createdVideos.length,
    ".mp4",
  );

  const videos = await mapSequentially(
    createdVideos,
    async (currentVideo, index) => {
      const videoDownload = await downloadFile(
        currentVideo.url,
        videoPaths[index],
        client.getMediaDownloadHeaders(),
      );

      return {
        index: index + 1,
        id: currentVideo.id,
        url: currentVideo.url,
        path: videoDownload.path,
        bytes: videoDownload.bytes,
        contentType: videoDownload.contentType,
        downloadableFileName: currentVideo.downloadableFileName ?? null,
        sourceMediaUrl: currentVideo.sourceMedia?.url ?? null,
        sourceThumbnail: currentVideo.sourceMedia?.thumbnail ?? null,
        lineage: [{
          step: "create",
          id: currentVideo.id,
          url: currentVideo.url,
          status: currentVideo.status,
        }],
      };
    },
  );

  const result = {
    ok: true,
    command: "video create",
    sessionPath,
    prompt,
    aspect: aspect ?? null,
    conversationId: createResult.conversationId,
    extendCount,
    videos,
    message: `Saved ${videos.length} video(s).`,
  };

  emitResult(result, options.json);
}

export async function historyDownloadCommand(
  options: HistoryDownloadOptions,
): Promise<void> {
  const outDir = resolvePath(options.out);
  const { client, sessionPath } = await createClient(options.sessionPath);
  const inventory = await collectHistoryInventory(sessionPath);
  const files = await downloadHistoryInventory(
    inventory.entries,
    outDir,
    client.getMediaDownloadHeaders(),
  );

  let deleted: { removedPromptIds: string[] } | null = null;
  if (options.delete) {
    const savedPromptIds = [...new Set(files.map((file) => file.promptId))]
      .sort();
    deleted = await clearHistoryContent(sessionPath, savedPromptIds);
  }

  const imageCount = files.filter((file) => file.kind === "image").length;
  const videoCount = files.filter((file) => file.kind === "video").length;
  const result = {
    ok: true,
    command: "history download",
    sessionPath,
    out: outDir,
    deleteAfterDownload: options.delete ?? false,
    promptCount: inventory.entries.length,
    createIds: inventory.createIds,
    files,
    deletedPromptIds: deleted?.removedPromptIds ?? [],
    message: options.delete
      ? `Saved ${imageCount} image(s) and ${videoCount} video(s), then removed ${
        deleted?.removedPromptIds.length ?? 0
      } prompt(s) from Meta history.`
      : `Saved ${imageCount} image(s) and ${videoCount} video(s).`,
  };

  emitResult(result, options.json);
}

export async function historyClearCommand(
  options: HistoryClearOptions,
): Promise<void> {
  if (!options.force) {
    throw new Error("history clear is destructive. Re-run with --force.");
  }

  const { sessionPath } = await createClient(options.sessionPath);
  const deleted = await clearHistoryContent(sessionPath);
  const result = {
    ok: true,
    command: "history clear",
    sessionPath,
    removedPromptIds: deleted.removedPromptIds,
    message:
      `Removed ${deleted.removedPromptIds.length} prompt(s) from Meta history.`,
  };

  emitResult(result, options.json);
}

function buildCli() {
  const cli = new Command();
  const auth = new Command().description("Authentication workflows.");
  auth.action(() => auth.showHelp());
  auth.command("login")
    .description(
      "Open a browser and save reusable Meta auth material to the session path.",
    )
    .option("-u, --url <url:string>", "Start URL.", {
      default: "https://meta.ai/create",
    })
    .example(
      "Save a reusable session at the default path",
      "meta-ai auth login",
    )
    .example(
      "Save a reusable session at a custom path",
      "meta-ai --session-path ./.auth/meta-session.json auth login",
    )
    .action(loginCommand);

  return cli
    .noExit()
    .name("meta-ai")
    .version(VERSION)
    .versionOption("-v, --version")
    .description(
      `Meta AI media automation CLI. Run auth login first, then reuse the same session file on later authenticated commands. Default session path: ${DEFAULT_SESSION_PATH}.`,
    )
    .globalOption("--json", "Emit schema-stable JSON output.")
    .globalOption(
      "-s, --session-path <path:string>",
      `Session/auth path. Defaults to ${DEFAULT_SESSION_PATH}.`,
      { default: DEFAULT_SESSION_PATH },
    )
    .action(() => cli.showHelp())
    .example(
      "Bootstrap a session",
      "meta-ai --json auth login",
    )
    .example(
      "Reuse the saved session on later commands",
      'meta-ai --json --session-path ~/.auth/cliat@meta-ai.json image create --prompt "a fox in snowfall" --image-out out/fox',
    )
    .example(
      "Download generated history and remove the prompts that produced the saved files",
      "meta-ai --json --session-path ~/.auth/cliat@meta-ai.json history download --out out/history --delete",
    )
    .command("auth", auth)
    .command(
      "image",
      new Command()
        .description("Image workflows.")
        .command("create")
        .description("Generate images and optionally animate and extend them.")
        .option("-p, --prompt <text:string>", "Image prompt.", {
          required: true,
        })
        .option("-i, --image-out <path:string>", "Base image output path, existing directory, or directory ending with a slash.", {
          required: true,
        })
        .option("-v, --video-out <path:string>", "Base video output path.")
        .option(
          "-a, --animate [text:string]",
          "Animate every generated image; omit text for the default Animate prompt.",
        )
        .option(
          "-r, --aspect <ratio:string>",
          'Aspect ratio: "9:16", "1:1", or "16:9".',
          { default: "9:16" },
        )
        .option("--count <n:integer>", "How many image variants to create.", {
          default: 1,
        })
        .option(
          "--extend <n:integer>",
          "How many times to extend each video.",
          {
            default: 0,
          },
        )
        .example(
          "Create one image",
          'meta-ai --json --session-path ~/.auth/cliat@meta-ai.json image create --prompt "a fox in snowfall" --image-out out/fox --aspect 1:1',
        )
        .example(
          "Create and animate a batch",
          'meta-ai --json --session-path ~/.auth/cliat@meta-ai.json image create --prompt "a neon koi fish in a dark pond" --image-out out/koi --count 2 --animate "slow water ripple and gentle camera drift" --video-out out/koi --extend 2',
        )
        .action(imageCreateCommand),
    )
    .command(
      "video",
      new Command()
        .description("Video workflows.")
        .command("create")
        .description("Generate videos and optionally extend them.")
        .option("-p, --prompt <text:string>", "Video prompt.", {
          required: true,
        })
        .option("-v, --video-out <path:string>", "Base video output path.", {
          required: true,
        })
        .option(
          "-r, --aspect <ratio:string>",
          'Aspect ratio: "9:16", "1:1", or "16:9".',
          { required: true },
        )
        .option(
          "--extend <n:integer>",
          "How many times to extend each video.",
          {
            default: 0,
          },
        )
        .example(
          "Create videos",
          'meta-ai --json --session-path ~/.auth/cliat@meta-ai.json video create --prompt "a paper airplane gliding through clouds" --video-out out/plane --aspect 16:9',
        )
        .action(videoCreateCommand),
    )
    .command(
      "history",
      new Command()
        .description("Download or clear generated Meta AI history.")
        .command(
          "download",
          new Command()
            .description(
              "Download generated media from your Meta create and vibes history.",
            )
            .option(
              "-o, --out <path:string>",
              "Directory where downloaded history files will be written.",
              { required: true },
            )
            .option(
              "--delete",
              "After downloading, remove the related prompts from Meta history.",
            )
            .example(
              "Download all generated media",
              "meta-ai --json --session-path ~/.auth/cliat@meta-ai.json history download --out out/history",
            )
            .example(
              "Download and then remove from Meta history",
              "meta-ai --json --session-path ~/.auth/cliat@meta-ai.json history download --out out/history --delete",
            )
            .action(historyDownloadCommand),
        )
        .command(
          "clear",
          new Command()
            .description("Remove generated prompts from Meta history.")
            .option(
              "--force",
              "Required for this destructive command.",
            )
            .example(
              "Clear generated history",
              "meta-ai --json --session-path ~/.auth/cliat@meta-ai.json history clear --force",
            )
            .action(historyClearCommand),
        ),
    );
}

export async function runCli(args = Deno.args): Promise<void> {
  const json = args.includes("--json");

  try {
    await buildCli().parse(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(formatOutput({ ok: false, message }, json));
    if (Deno.exitCode === 0) {
      Deno.exitCode = 1;
    }
  }
}

if (import.meta.main) {
  await runCli();
}

function emitResult(value: unknown, json?: boolean): void {
  console.log(formatOutput(value, json ?? false));
}

async function createClient(sessionPath: string | undefined): Promise<{
  client: MetaAiClient;
  sessionPath: string;
}> {
  const resolvedSessionPath = resolveSessionPath(sessionPath);
  const { state } = await loadStorageState(resolvedSessionPath);
  return {
    client: new MetaAiClient(state),
    sessionPath: resolvedSessionPath,
  };
}

function resolveSessionPath(sessionPath?: string): string {
  return resolvePath(sessionPath ?? DEFAULT_SESSION_PATH);
}

function normalizeAnimatePrompt(
  animate?: boolean | string,
): string | undefined {
  if (animate === undefined || animate === false) {
    return undefined;
  }

  if (animate === true) {
    return "Animate";
  }

  return animate;
}

function parseAspectRatio(
  value: string | undefined,
  useDefault: boolean,
): AspectRatio | undefined {
  if (value === undefined) {
    return useDefault ? "9:16" : undefined;
  }

  if (value === "9:16" || value === "1:1" || value === "16:9") {
    return value;
  }

  throw new Error('--aspect must be one of: "9:16", "1:1", "16:9".');
}

function ensureUrls<T extends GeneratedImage | CompletedVideo>(
  variants: T[],
  label: string,
  content?: string,
): Array<T & { url: string }> {
  if (variants.length === 0) {
    const detail = content ? ` Meta said: ${content}` : "";
    throw new Error(`Meta did not return any ${label} variants.${detail}`);
  }

  return variants.map((variant, index) => {
    if (!variant.url) {
      throw new Error(
        `Returned ${label} variant ${index + 1} does not have a URL.`,
      );
    }

    return {
      ...variant,
      url: variant.url,
    };
  });
}

async function downloadImages(
  client: MetaAiClient,
  images: Array<GeneratedImage & { url: string }>,
  outputImage: string,
): Promise<ImageDownloadResult[]> {
  return await mapSequentially(images, async (image, index) => {
    const download = await downloadGeneratedImage(
      image.url,
      outputImage,
      client.getMediaDownloadHeaders(),
    );

    return {
      index: index + 1,
      id: image.id,
      url: image.url,
      thumbnail: image.thumbnail ?? null,
      downloadableFileName: image.downloadableFileName ?? null,
      path: download.path,
      bytes: download.bytes,
      contentType: download.contentType,
    };
  });
}

async function createImageAnimations(
  client: MetaAiClient,
  sessionPath: string,
  images: Array<GeneratedImage & { url: string }>,
  options: {
    animationPrompt: string;
    conversationId: string;
    extendCount: number;
    outputVideo: string;
  },
): Promise<AnimationResult[]> {
  await ensurePlaywrightCliReady();

  const videoPaths = await planNumberedOutputs(
    options.outputVideo,
    images.length,
    ".mp4",
  );
  const sessionName = generatePlaywrightCliSessionName("meta-ai-animate");

  try {
    await openPlaywrightCliSession(sessionName, { url: "about:blank" });
    await loadPlaywrightCliState(sessionName, sessionPath);
    await pauseBetweenMutationJobs();

    return await mapSequentially(images, async (image, index) => {
      if (index > 0) {
        await pauseBetweenMutationJobs();
      }

      return await createImageAnimation(client, sessionName, image, {
        ...options,
        imageIndex: index + 1,
        videoPath: videoPaths[index],
      });
    });
  } finally {
    await closePlaywrightCliSession(sessionName).catch(() => undefined);
  }
}

async function createVideoWithFrontend(
  sessionPath: string,
  prompt: string,
  aspect?: AspectRatio,
): Promise<{
  conversationId: string | null;
  branchPath: string;
  videos: CompletedVideo[];
}> {
  await ensurePlaywrightCliReady();

  const sessionName = generatePlaywrightCliSessionName("meta-ai-video");
  const frontendPrompt = formatFrontendVideoPrompt(prompt, aspect);

  try {
    await openPlaywrightCliSession(sessionName, { url: "about:blank" });
    await loadPlaywrightCliState(sessionName, sessionPath);
    await gotoPlaywrightCliSession(sessionName, "https://www.meta.ai/create");

    const result = await runPlaywrightCliCodeJson<FrontendVideoCreateResult>(
      sessionName,
      buildFrontendVideoCreateCode(frontendPrompt),
    );

    if (!result.ok || !result.videos?.length) {
      throw new Error(
        result.reason ??
          "Meta frontend did not return generated video URLs.",
      );
    }

    return {
      conversationId: result.conversationId ?? null,
      branchPath: "0",
      videos: result.videos.map((video, index) => ({
        id: inferVideoIdFromUrl(video.url) ?? `frontend-video-${index + 1}`,
        url: video.url,
        thumbnail: video.thumbnail ?? null,
        prompt,
        status: "COMPLETE",
        downloadableFileName: inferDownloadableFileName(video.url),
      })),
    };
  } finally {
    await closePlaywrightCliSession(sessionName).catch(() => undefined);
  }
}

export async function runFrontendImageBatch(
  count: number,
  generateOne: () => Promise<FrontendImageCreateResult>,
): Promise<FrontendImageCreateResult> {
  if (!Number.isInteger(count) || count < 1 || count > 4) throw new Error("Frontend image count must be between 1 and 4.");
  const result: FrontendImageCreateResult = { ok: true, images: [] };
  for (let index = 0; index < count; index++) {
    const next = await generateOne();
    if (!next?.ok || !Array.isArray(next.images) || next.images.length !== 1) {
      throw new Error(next?.reason ?? `Meta frontend failed to generate image ${index + 1} of ${count}.`);
    }
    const image = next.images[0];
    if (typeof image?.url !== "string" || !image.url.startsWith("https://")) throw new Error("Meta frontend returned an invalid image URL.");
    if (result.images!.some(existing => existing.url === image.url)) throw new Error("Meta frontend returned an earlier image instead of a new generation.");
    result.images!.push(image);
    result.conversationId = next.conversationId ?? result.conversationId;
  }
  return result;
}

async function createImageWithFrontend(
  sessionPath: string,
  prompt: string,
  aspect: AspectRatio | undefined,
  count: number,
): Promise<{
  conversationId: string | null;
  branchPath: string;
  images: GeneratedImage[];
}> {
  await ensurePlaywrightCliReady();

  const sessionName = generatePlaywrightCliSessionName("meta-ai-image");
  const frontendPrompt = formatFrontendImagePrompt(prompt, aspect);

  try {
    await openPlaywrightCliSession(sessionName, { url: "about:blank" });
    await loadPlaywrightCliState(sessionName, sessionPath);
    await gotoPlaywrightCliSession(sessionName, "https://meta.ai");

    const result = await runFrontendImageBatch(count, () =>
      runPlaywrightCliCodeJson<FrontendImageCreateResult>(
        sessionName,
        buildFrontendImageCreateCode(frontendPrompt, 1, aspect),
        { timeoutMs: FRONTEND_IMAGE_TIMEOUT_MS + 60_000 },
      )
    );

    return {
      conversationId: result.conversationId ?? null,
      branchPath: "0",
      images: result.images!.map((image, index) => ({
        id: inferImageIdFromUrl(image.url) ?? `frontend-image-${index + 1}`,
        url: image.url,
        thumbnail: image.thumbnail ?? null,
        prompt,
        downloadableFileName: image.fileName ?? null,
      })),
    };
  } finally {
    await closePlaywrightCliSession(sessionName).catch(() => undefined);
  }
}

async function ensurePlaywrightCliReady(): Promise<void> {
  const dependencyChecks = await checkPlaywrightCliDependencies();
  if (
    dependencyChecks.playwrightCliAvailable &&
    dependencyChecks.playwrightCliBrowserReady
  ) {
    return;
  }

  throw new Error(dependencyChecks.message);
}

async function createImageAnimation(
  client: MetaAiClient,
  sessionName: string,
  image: GeneratedImage & { url: string },
  options: {
    imageIndex: number;
    animationPrompt: string;
    conversationId: string;
    extendCount: number;
    videoPath: string;
  },
): Promise<AnimationResult> {
  const animatedDraft = await animateImageWithLightbox(
    sessionName,
    image,
    options.animationPrompt,
  );
  let currentVideo = await pickFirstCompletedVideo(
    client,
    animatedDraft.videos,
    options.conversationId,
  );
  const videoLineage: CompletedVideo[] = [currentVideo];

  for (let i = 0; i < options.extendCount; i += 1) {
    await pauseBetweenMutationJobs();
    const extendedDraft = await extendVideoWithLightbox(
      sessionName,
      currentVideo,
    );
    currentVideo = await pickFirstCompletedVideo(
      client,
      extendedDraft.videos,
      options.conversationId,
    );
    videoLineage.push(currentVideo);
  }

  const finalDownload = await downloadFile(
    currentVideo.url,
    options.videoPath,
    client.getMediaDownloadHeaders(),
  );

  return {
    imageIndex: options.imageIndex,
    prompt: options.animationPrompt,
    finalVideo: {
      id: currentVideo.id,
      url: currentVideo.url,
      path: finalDownload.path,
      bytes: finalDownload.bytes,
      contentType: finalDownload.contentType,
      downloadableFileName: currentVideo.downloadableFileName ?? null,
    },
    lineage: videoLineage.map((video, lineageIndex) => ({
      step: lineageIndex === 0 ? "animate" : `extend-${lineageIndex}`,
      id: video.id,
      url: video.url,
      status: video.status,
    })),
  };
}

type LightboxMediaResult = {
  ok: boolean;
  before?: string;
  after?: string;
  videoId?: string;
  reason?: string;
};

async function animateImageWithLightbox(
  sessionName: string,
  image: GeneratedImage,
  prompt: string,
): Promise<{ videos: GeneratedVideo[] }> {
  const animationPrompt = prompt.trim() || "Animate";

  await gotoPlaywrightCliSession(
    sessionName,
    `https://www.meta.ai/create/${image.id}`,
  );

  const result = await runPlaywrightCliCodeJson<LightboxMediaResult>(
    sessionName,
    await buildLightboxAutomationCode("metaAiCustomAnimate", {
      prompt: animationPrompt,
      sourceMediaId: image.id,
    }),
  );

  if (!result.ok || !result.videoId) {
    const detail = result.reason ? ` ${result.reason}` : "";
    throw new Error(
      `Meta custom animate did not return a video media id.${detail}`,
    );
  }

  return {
    videos: [buildGeneratedVideoDraft(result.videoId, animationPrompt, image)],
  };
}

async function extendVideoWithLightbox(
  sessionName: string,
  video: CompletedVideo,
): Promise<{ videos: GeneratedVideo[] }> {
  await gotoPlaywrightCliSession(
    sessionName,
    `https://www.meta.ai/create/${video.id}`,
  );

  const result = await runPlaywrightCliCodeJson<LightboxMediaResult>(
    sessionName,
    await buildLightboxAutomationCode("metaAiExtendAnimation", {
      sourceMediaId: video.id,
    }),
  );

  if (!result.ok || !result.videoId) {
    const detail = result.reason ? ` ${result.reason}` : "";
    throw new Error(
      `Meta video extend did not return a video media id.${detail}`,
    );
  }

  return {
    videos: [buildGeneratedVideoDraft(result.videoId, "Extend", video)],
  };
}

async function buildLightboxAutomationCode(
  functionName: "metaAiCustomAnimate" | "metaAiExtendAnimation",
  input: Record<string, unknown>,
): Promise<string> {
  const scriptPath = await getCustomAnimateScriptPath();

  return `async (page) => {
    await page.addScriptTag({ path: ${JSON.stringify(scriptPath)} });
    return await page.evaluate(async (input) => {
      return await window[${JSON.stringify(functionName)}](input);
    }, ${JSON.stringify(input)});
  }`;
}

function buildGeneratedVideoDraft(
  id: string,
  prompt: string,
  sourceMedia: GeneratedImage | CompletedVideo,
): GeneratedVideo {
  return {
    id,
    url: null,
    thumbnail: null,
    prompt,
    sourceMedia: {
      id: sourceMedia.id,
      url: sourceMedia.url,
      thumbnail: sourceMedia.thumbnail ?? null,
    },
  };
}

function buildFrontendVideoCreateCode(prompt: string): string {
  return `async (page) => {
    const input = {
      prompt: ${JSON.stringify(prompt)},
      expectedVideos: ${FRONTEND_VIDEO_VARIANT_COUNT},
      timeoutMs: ${15 * 60 * 1000},
      stableMs: 15_000,
    };

    const collectVideos = async () => await page.evaluate(() => {
      const seen = new Set();
      return [...document.querySelectorAll("[data-testid='generated-video']")]
        .map((element) => ({
          url: element.getAttribute("data-video-url"),
          thumbnail: element.getAttribute("data-video-thumbnail"),
        }))
        .filter((video) => {
          if (!video.url || seen.has(video.url)) {
            return false;
          }
          seen.add(video.url);
          return true;
        });
    });

    const collectPromptIds = async () => await page.evaluate(() =>
      [...document.querySelectorAll('a[href*="/prompt/"]')]
        .map((anchor) => anchor.href.match(/\\/prompt\\/([^/?#]+)/)?.[1] ?? null)
        .filter((id) => id !== null)
    );

    await page.waitForSelector("[contenteditable=true]", { timeout: 30_000 });
    const beforeVideos = new Set((await collectVideos()).map((video) => video.url));
    const beforePromptIds = new Set(await collectPromptIds());

    const textbox = page.locator("[contenteditable=true]").last();
    await textbox.click();
    await textbox.press("Control+A").catch(async () => {
      await textbox.press("Meta+A");
    });
    await textbox.press("Backspace");
    await textbox.type(input.prompt, { delay: 1 });

    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some((button) =>
        ((button.innerText || button.getAttribute("aria-label") || "").trim() === "Send") &&
        !button.disabled
      ),
      null,
      { timeout: 10_000 },
    );

    await page.getByRole("button", { name: "Send" }).last().click();

    const deadline = Date.now() + input.timeoutMs;
    let latest = [];
    let lastCount = 0;
    let stableSince = Date.now();

    while (Date.now() < deadline) {
      await page.waitForTimeout(1_000);
      latest = (await collectVideos()).filter((video) => !beforeVideos.has(video.url));

      if (latest.length !== lastCount) {
        lastCount = latest.length;
        stableSince = Date.now();
      }

      if (latest.length >= input.expectedVideos) {
        break;
      }

      if (latest.length > 0 && Date.now() - stableSince >= input.stableMs) {
        break;
      }
    }

    if (latest.length === 0) {
      return {
        ok: false,
        reason: "Timed out waiting for Meta's frontend to expose generated video URLs.",
      };
    }

    const afterPromptIds = await collectPromptIds();
    const conversationId =
      afterPromptIds.find((id) => !beforePromptIds.has(id)) ??
      afterPromptIds[0] ??
      null;

    return {
      ok: true,
      conversationId,
      videos: latest.slice(0, input.expectedVideos),
    };
  }`;
}

function formatFrontendVideoPrompt(
  prompt: string,
  aspect?: AspectRatio,
): string {
  const aspectSuffix = aspect ? ` aspect ${aspect}` : "";
  return `Create a video: ${prompt}${aspectSuffix}`;
}

export function formatFrontendImagePrompt(
  prompt: string,
  aspect?: AspectRatio,
): string {
  if (!aspect) {
    return prompt;
  }
  return `Create an image: ${prompt}. Aspect ratio: ${aspect}.`;
}

export function buildFrontendImageCreateCode(
  prompt: string,
  expectedImages: number,
  aspect?: AspectRatio,
): string {
  const promptJson = JSON.stringify(prompt);
  return `async (page) => {
    const input = {
      prompt: ${promptJson},
      expectedImages: ${expectedImages},
      aspect: ${JSON.stringify(aspect ?? null)},
      timeoutMs: ${FRONTEND_IMAGE_TIMEOUT_MS},
      stableMs: ${FRONTEND_IMAGE_STABLE_MS},
    };

    const collectImages = async () => await page.evaluate(() => {
      const seen = new Set();
      return [...document.querySelectorAll("img")]
        .map((element) => ({
          url: element.getAttribute("src") || "",
          alt: element.getAttribute("alt") || "",
          width: element.naturalWidth,
          height: element.naturalHeight,
          complete: element.complete,
        }))
        .filter((image) => {
          if (!image.url || seen.has(image.url) || !image.complete || image.width < 512 || image.height < 512) return false;
          if (
            image.url.includes("fbcdn") &&
            (image.url.includes("gallery") ||
              image.url.includes(".webp") ||
              image.url.includes(".jpg") ||
              image.url.includes(".png") ||
              image.url.includes("t58.90637"))
          ) {
            seen.add(image.url);
            return true;
          }
          return false;
        });
    });

    const collectPromptIds = async () => await page.evaluate(() =>
      [...document.querySelectorAll('a[href*="/prompt/"]')]
        .map((a) => a.href.match(/\\/prompt\\/([^/?#]+)/)?.[1] ?? null)
        .filter((id) => id !== null)
    );

    await page.waitForSelector("[contenteditable=true]", { timeout: 30000 });
    const beforeImages = new Set((await collectImages()).map((img) => img.url));
    const beforePromptIds = new Set(await collectPromptIds());

    const textbox = page.locator("[contenteditable=true]").last();
    await textbox.fill(input.prompt);
    const sendBtn = page.getByRole("button", { name: /^(Send|Senden|Wyślij)$/i }).last();
    await sendBtn.click({ timeout: 15000 });

    const deadline = Date.now() + input.timeoutMs;
    let latest = [];
    let lastCount = 0;
    let stableSince = Date.now();

    while (Date.now() < deadline) {
      await page.waitForTimeout(2000);
      latest = (await collectImages()).filter((img) => !beforeImages.has(img.url));
      if (latest.length !== lastCount) {
        lastCount = latest.length;
        stableSince = Date.now();
      }
      if (latest.length >= input.expectedImages) break;
      if (latest.length > 0 && Date.now() - stableSince >= input.stableMs) break;
    }

    if (latest.length === 0) {
      return {
        ok: false,
        reason: "Timed out waiting for Meta frontend to expose generated image URLs.",
      };
    }

    if (input.aspect) {
      const [width, height] = input.aspect.split(":").map(Number);
      if (latest.some(image => Math.abs(image.width / image.height - width / height) > 0.03)) {
        return { ok: false, reason: "Meta generated images with a different aspect ratio than requested." };
      }
    }

    const afterPromptIds = await collectPromptIds();
    const conversationId =
      afterPromptIds.find((id) => !beforePromptIds.has(id)) ??
      afterPromptIds[0] ??
      null;

    return {
      ok: true,
      conversationId,
      images: latest.slice(0, input.expectedImages),
    };
  }`;
}

function inferImageIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/");
    const lastPart = pathParts.at(-1);
    if (lastPart) {
      return lastPart.replace(/\.\w+$/, "");
    }
    return null;
  } catch {
    return null;
  }
}

function inferVideoIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const encodedMetadata = parsed.searchParams.get("efg");
    if (encodedMetadata) {
      const metadata = JSON.parse(atob(encodedMetadata)) as {
        xpv_asset_id?: unknown;
      };
      if (
        typeof metadata.xpv_asset_id === "string" ||
        typeof metadata.xpv_asset_id === "number"
      ) {
        return String(metadata.xpv_asset_id);
      }
    }

    return parsed.pathname.split("/").at(-1)?.replace(/\.mp4$/i, "") ?? null;
  } catch {
    return null;
  }
}

function inferDownloadableFileName(url: string): string | null {
  const id = inferVideoIdFromUrl(url);
  return id ? `${id}.mp4` : null;
}

async function getCustomAnimateScriptPath(): Promise<string> {
  const scriptUrl = new URL("./lib/meta_lightbox_animate.js", import.meta.url);
  if (scriptUrl.protocol === "file:") {
    return fromFileUrl(scriptUrl);
  }

  const response = await fetch(scriptUrl);
  if (!response.ok) {
    throw new Error(
      `Could not load Meta lightbox automation script: ${response.status} ${response.statusText}`,
    );
  }

  const scriptPath = await Deno.makeTempFile({
    prefix: "meta-ai-lightbox-animate-",
    suffix: ".js",
  });
  await Deno.writeTextFile(scriptPath, await response.text());
  return scriptPath;
}

async function pickFirstCompletedVideo(
  client: MetaAiClient,
  variants: GeneratedVideo[],
  conversationId: string,
): Promise<CompletedVideo> {
  const completed = await client.waitForVideos(variants, conversationId);
  const video = completed[0];
  if (!video) {
    throw new Error("Meta did not return a completed video variant.");
  }
  return video;
}

async function mapSequentially<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (const [index, item] of items.entries()) {
    results.push(await worker(item, index));
  }
  return results;
}

async function pauseBetweenMutationJobs(): Promise<void> {
  const jitter = Math.floor(Math.random() * (MUTATION_PAUSE_JITTER_MS + 1));
  await new Promise((resolve) =>
    setTimeout(resolve, MUTATION_PAUSE_MS + jitter)
  );
}

async function runLoginBootstrapWithPlaywrightCli(
  url: string,
): Promise<StorageState> {
  console.error("Opening Meta login browser via playwright-cli...");
  const sessionName = generatePlaywrightCliSessionName("meta-ai-login");
  const tempStatePath = await Deno.makeTempFile({ suffix: ".json" });

  try {
    await openPlaywrightCliSession(sessionName, {
      url,
      headed: true,
    });
    console.error("Opened browser via playwright-cli.");
    console.error(
      "Complete the Meta login in the opened browser. The session will be saved automatically once the Meta auth cookie is detected.",
    );
    await waitForMetaSessionCookieInPlaywrightCliSession(
      sessionName,
      tempStatePath,
    );
    const { state } = await loadStorageState(tempStatePath);
    return state;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to launch playwright-cli browser session: ${message}`,
    );
  } finally {
    await closePlaywrightCliSession(sessionName).catch(() => undefined);
    await Deno.remove(tempStatePath).catch(() => undefined);
  }
}

async function waitForMetaSessionCookieInPlaywrightCliSession(
  sessionName: string,
  tempStatePath: string,
): Promise<void> {
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await savePlaywrightCliState(sessionName, tempStatePath);
    const { state } = await loadStorageState(tempStatePath);
    if (hasMetaSessionCookie(state)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, LOGIN_POLL_INTERVAL_MS));
  }

  throw new Error(
    "Timed out waiting for a Meta session cookie. Complete login in the opened browser and try again.",
  );
}
