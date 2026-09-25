import { createHash, randomBytes } from "node:crypto";

export const TIKTOK_SCOPES = ["user.info.basic", "video.upload", "video.publish"] as const;

export function generateTikTokCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function deriveTikTokCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("hex");
}

export function buildTikTokAuthorizationUrl(input: {
  clientKey: string;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
  codeChallenge?: string;
  codeChallengeMethod?: "S256";
}): string {
  const params: Record<string, string> = {
    client_key: input.clientKey,
    response_type: "code",
    scope: (input.scopes ?? [...TIKTOK_SCOPES]).join(","),
    redirect_uri: input.redirectUri,
    state: input.state
  };
  if (input.codeChallenge) {
    params.code_challenge = input.codeChallenge;
    params.code_challenge_method = input.codeChallengeMethod ?? "S256";
  }
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.search = new URLSearchParams(params).toString();
  return url.toString();
}

export function sanitizeTikTokError(message: string): string {
  return message
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replace(/refresh_token=[^&\s]+/gi, "refresh_token=[redacted]")
    .replace(/client_secret=[^&\s]+/gi, "client_secret=[redacted]")
    .replace(/open_id=[^&\s]+/gi, "open_id=[redacted]")
    .replace(/upload_url=[^&\s]+/gi, "upload_url=[redacted]");
}

export function sanitizeUploadUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove sensitive query params if present
    for (const key of [...parsed.searchParams.keys()]) {
      if (/token|signature|key|secret/i.test(key)) parsed.searchParams.set(key, "[redacted]");
    }
    return parsed.origin + parsed.pathname + (parsed.search ? "?[redacted]" : "");
  } catch {
    return "[redacted upload url]";
  }
}

export const TIKTOK_DRAFT_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/";
export const TIKTOK_VIDEO_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/";
export const TIKTOK_CHUNK_MIN = 5 * 1024 * 1024;
export const TIKTOK_CHUNK_MAX = 64 * 1024 * 1024;
export const TIKTOK_DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024;

export function getTikTokInitEndpoint(mode: "draft" | "direct"): string {
  return mode === "draft" ? TIKTOK_DRAFT_INIT_URL : TIKTOK_VIDEO_INIT_URL;
}

export function computeTikTokUploadChunks(videoSize: number, chunkSize: number = TIKTOK_DEFAULT_CHUNK_SIZE): Array<{ index: number; start: number; end: number; length: number; contentRange: string }> {
  if (videoSize <= 0) throw new Error("Video size must be positive");
  if (chunkSize < TIKTOK_CHUNK_MIN || chunkSize > TIKTOK_CHUNK_MAX) throw new Error(`Chunk size must be between ${TIKTOK_CHUNK_MIN} and ${TIKTOK_CHUNK_MAX}`);
  const totalChunkCount = Math.max(1, Math.ceil(videoSize / chunkSize));
  const chunks: Array<{ index: number; start: number; end: number; length: number; contentRange: string }> = [];
  for (let idx = 0; idx < totalChunkCount; idx++) {
    const start = idx * chunkSize;
    const end = Math.min(start + chunkSize, videoSize) - 1;
    const length = end - start + 1;
    chunks.push({ index: idx, start, end, length, contentRange: `bytes ${start}-${end}/${videoSize}` });
  }
  return chunks;
}
