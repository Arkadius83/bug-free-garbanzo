import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeStorage, shell } from "electron";
import type { TikTokConnection, TikTokCreatorInfo, TikTokTestPublishInput, TikTokTestPublishResult, TikTokUserProfile } from "../shared/contracts.js";
import { buildTikTokAuthorizationUrl, computeTikTokUploadChunks, deriveTikTokCodeChallenge, generateTikTokCodeVerifier, getTikTokInitEndpoint, sanitizeTikTokError, sanitizeUploadUrl, TIKTOK_CHUNK_MAX, TIKTOK_CHUNK_MIN, TIKTOK_DEFAULT_CHUNK_SIZE, TIKTOK_SCOPES } from "./tiktok-oauth.js";

const CALLBACK_PORT = 43823;
const CALLBACK_PATH = "/callback";
const CALLBACK_URL = `http://127.0.0.1:${CALLBACK_PORT}${CALLBACK_PATH}`;
const TIKTOK_LOGIN_SCOPES = ["user.info.basic"] as const;
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";
const TIKTOK_CREATOR_INFO_URL = "https://open.tiktokapis.com/v2/post/publish/creator_info/query/";
const TIKTOK_VIDEO_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/";
const TIKTOK_VIDEO_STATUS_URL = "https://open.tiktokapis.com/v2/post/publish/status/fetch/";

interface StoredTikTok {
  clientKey: string;
  clientSecretEncrypted: string;
  accessTokenEncrypted?: string;
  refreshTokenEncrypted?: string;
  expiresAt?: string;
  openId?: string;
  displayName?: string;
  scope?: string;
}

export class TikTokClient {
  private pending: { state: string; verifier: string } | null = null;
  private lastError: string | null = null;
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, "integrations", "tiktok.json");
  }

  async status(): Promise<TikTokConnection> {
    const stored = await this.read();
    return {
      configured: Boolean(stored?.clientKey && stored.clientSecretEncrypted),
      connected: Boolean(stored?.accessTokenEncrypted && stored.openId),
      openId: stored?.openId ?? null,
      displayName: stored?.displayName ?? null,
      callbackUrl: CALLBACK_URL,
      scopes: stored?.scope ? stored.scope.split(",") : [...TIKTOK_SCOPES],
      error: this.lastError
    };
  }

  async saveCredentials(clientKey: string, clientSecret: string): Promise<TikTokConnection> {
    if (!clientKey.trim() || !clientSecret.trim()) throw new Error("TikTok Client Key and Client Secret are required");
    const current = await this.read();
    await this.write({
      ...current,
      clientKey: clientKey.trim(),
      clientSecretEncrypted: this.encrypt(clientSecret.trim())
    } as StoredTikTok);
    this.lastError = null;
    return this.status();
  }

  async beginConnect(): Promise<void> {
    const stored = await this.requireConfigured();
    this.lastError = null;
    console.info("[tiktok-oauth] flow starting");
    console.info("[tiktok-oauth] configuration", { redirectUri: CALLBACK_URL, clientKeyPresent: Boolean(stored.clientKey) });
    const state = randomBytes(24).toString("hex");
    const verifier = generateTikTokCodeVerifier();
    const challenge = deriveTikTokCodeChallenge(verifier);
    this.pending = { state, verifier };

    const server = createServer(async (req, res) => {
      if (!req.url?.startsWith(CALLBACK_PATH)) {
        res.writeHead(404).end();
        return;
      }
      try {
        await this.handleCallback(new URL(req.url, CALLBACK_URL));
        console.info("[tiktok-oauth] callback succeeded");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h1>TikTok connected</h1><p>You can close this window and return to AI Studio Manager.</p>");
      } catch (error) {
        const msg = sanitizeTikTokError(error instanceof Error ? error.message : "TikTok authorization failed");
        this.lastError = msg;
        console.error("[tiktok-oauth] callback failed", { error: msg });
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end(msg);
      } finally {
        server.close();
      }
    });

    console.info("[tiktok-oauth] starting callback server", { host: "127.0.0.1", port: CALLBACK_PORT, path: CALLBACK_PATH });
    try {
      await new Promise<void>((resolve, reject) => server.once("error", reject).listen(CALLBACK_PORT, "127.0.0.1", resolve));
      console.info("[tiktok-oauth] callback server listening", { redirectUri: CALLBACK_URL });
    } catch (error) {
      this.pending = null;
      this.lastError = sanitizeTikTokError(error instanceof Error ? error.message : "Could not start TikTok callback server");
      console.error("[tiktok-oauth] callback server failed", { error: this.lastError });
      throw new Error(`Could not start TikTok callback server: ${this.lastError}`);
    }
    setTimeout(() => {
      if (server.listening) {
        this.lastError = "TikTok authorization timed out";
        server.close();
      }
    }, 120_000).unref();

    const url = buildTikTokAuthorizationUrl({
      clientKey: stored.clientKey,
      redirectUri: CALLBACK_URL,
      state,
      scopes: TIKTOK_LOGIN_SCOPES,
      codeChallenge: challenge,
      codeChallengeMethod: "S256"
    });
    console.info(`[tiktok-oauth] requested scopes: ${TIKTOK_LOGIN_SCOPES.join(",")}`);
    console.info("[tiktok-oauth] opening authorization URL in system browser", { origin: new URL(url).origin });
    try {
      await shell.openExternal(url);
      console.info("[tiktok-oauth] shell.openExternal called");
    } catch (error) {
      if (server.listening) server.close();
      this.pending = null;
      this.lastError = sanitizeTikTokError(error instanceof Error ? error.message : "Could not open the system browser");
      console.error("[tiktok-oauth] shell.openExternal failed", { error: this.lastError });
      throw new Error(`Could not open TikTok authorization in the system browser: ${this.lastError}`);
    }
  }

  private async handleCallback(url: URL): Promise<void> {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    if (error) throw new Error(`TikTok authorization failed: ${error}`);
    if (!code || !state || !this.pending || state !== this.pending.state) throw new Error("Invalid or expired TikTok callback");
    const stored = await this.requireConfigured();
    const secret = this.decrypt(stored.clientSecretEncrypted);
    const verifier = this.pending.verifier;
    const tokens = await this.exchangeToken({
      client_key: stored.clientKey,
      client_secret: secret,
      code,
      grant_type: "authorization_code",
      redirect_uri: CALLBACK_URL,
      code_verifier: verifier
    });
    this.pending = null;
    await this.write({
      ...stored,
      accessTokenEncrypted: this.encrypt(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token ? this.encrypt(tokens.refresh_token) : stored.refreshTokenEncrypted,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      openId: tokens.open_id,
      displayName: tokens.open_id,
      scope: tokens.scope ?? [...TIKTOK_SCOPES].join(",")
    } as StoredTikTok);
    this.lastError = null;
  }

  async disconnect(): Promise<TikTokConnection> {
    const stored = await this.read();
    if (stored) await this.write({ clientKey: stored.clientKey, clientSecretEncrypted: stored.clientSecretEncrypted } as StoredTikTok);
    this.lastError = null;
    return this.status();
  }

  async getCreatorInfo(): Promise<TikTokCreatorInfo> {
    const token = await this.getAuthorizedToken();
    const stored = await this.read();
    if (!stored?.openId) throw new Error("TikTok open_id missing; reconnect required");
    const response = await fetch(TIKTOK_CREATOR_INFO_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(30_000)
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`TikTok creator_info failed HTTP ${response.status}: ${sanitizeTikTokError(text.slice(0, 800))}`);
    let json: { data?: TikTokCreatorInfo; error?: { code?: string; message?: string } };
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      throw new Error(`TikTok creator_info returned non-JSON: ${text.slice(0, 300)}`);
    }
    if (json.error) throw new Error(`TikTok creator_info: ${json.error.message ?? json.error.code}`);
    return json.data ?? {};
  }

  async getUserProfile(): Promise<TikTokUserProfile> {
    const fields = ["open_id", "display_name", "avatar_url"] as const;
    const token = await this.getAuthorizedToken();
    const url = new URL(TIKTOK_USER_INFO_URL);
    url.searchParams.set("fields", fields.join(","));
    console.info("[tiktok-user-info] request started", { endpoint: TIKTOK_USER_INFO_URL, fields: fields.join(",") });
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000)
    });
    const text = await response.text();
    console.info("[tiktok-user-info] response received", { status: response.status, ok: response.ok });
    if (!response.ok) throw new Error(`TikTok User Info failed HTTP ${response.status}: ${sanitizeTikTokError(text.slice(0, 800))}`);
    let json: { data?: { user?: { open_id?: string; display_name?: string; avatar_url?: string } }; error?: { code?: string; message?: string } };
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      throw new Error("TikTok User Info returned invalid JSON");
    }
    if (json.error?.code && json.error.code !== "ok") throw new Error(`TikTok User Info: ${sanitizeTikTokError(json.error.message ?? json.error.code)}`);
    const user = json.data?.user;
    if (!user?.open_id) throw new Error("TikTok User Info response is missing open_id");
    const profile = { openId: user.open_id, displayName: user.display_name?.trim() || user.open_id, avatarUrl: user.avatar_url ?? null };
    const stored = await this.requireConfigured();
    await this.write({ ...stored, openId: profile.openId, displayName: profile.displayName });
    this.lastError = null;
    console.info("[tiktok-user-info] profile loaded", { displayNamePresent: Boolean(user.display_name), avatarPresent: Boolean(user.avatar_url), openIdPresent: true });
    return profile;
  }

  async publishTest(input: TikTokTestPublishInput): Promise<TikTokTestPublishResult> {
    const startedAt = new Date().toISOString();
    const mode = input.mode;
    const endpoint = getTikTokInitEndpoint(mode);
    const destinationName = (await this.status()).displayName ?? (await this.read())?.openId ?? "TikTok account";
    const caption = input.caption.trim();

    const result = (publishId: string | null, ok: boolean, error: string | null, creatorInfo: TikTokCreatorInfo | null): TikTokTestPublishResult => ({
      platform: "TikTok",
      ok,
      destinationName,
      remoteId: publishId,
      publishId,
      mode,
      creatorInfo,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: publishId ? (mode === "direct" ? "published" : "draft") : "failed",
      endpoint,
      sanitizedError: error ? sanitizeTikTokError(error) : null
    });

    if (!input.videoPath) return result(null, false, "Select a local video file first", null);
    if (!caption) return result(null, false, "Caption is required", null);
    if (caption.length > 2200) return result(null, false, "Caption must be 2,200 characters or fewer", null);
    if (!["draft", "direct"].includes(mode)) return result(null, false, "Invalid publish mode", null);

    let creatorInfo: TikTokCreatorInfo | null = null;
    if (mode === "direct") {
      try {
        creatorInfo = await this.getCreatorInfo();
      } catch (error) {
        const msg = sanitizeTikTokError(error instanceof Error ? error.message : "Failed to query TikTok creator info");
        return result(null, false, `Direct Post requires creator info: ${msg}`, null);
      }
      // If creator info restricts privacy, enforce private if needed. Just surface.
    }

    try {
      const token = await this.getAuthorizedToken();
      const publishId = await this.fileUploadFlow(token, input, creatorInfo);
      return result(publishId, true, null, creatorInfo);
    } catch (error) {
      const message = sanitizeTikTokError(error instanceof Error ? error.message : "TikTok publish failed");
      return result(null, false, message, creatorInfo);
    }
  }

  private async fileUploadFlow(token: string, input: TikTokTestPublishInput, creatorInfo: TikTokCreatorInfo | null): Promise<string> {
    const videoStat = await stat(input.videoPath);
    const videoSize = videoStat.size;
    if (videoSize === 0) throw new Error("Video file is empty");
    if (videoSize > 4 * 1024 * 1024 * 1024) throw new Error("Video exceeds TikTok 4GB limit");

    const chunkSize = TIKTOK_DEFAULT_CHUNK_SIZE;
    if (chunkSize < TIKTOK_CHUNK_MIN || chunkSize > TIKTOK_CHUNK_MAX) throw new Error("Invalid TikTok chunk size");
    const chunks = computeTikTokUploadChunks(videoSize, chunkSize);
    const totalChunkCount = chunks.length;

    const privacyLevel = input.privacyLevel ?? (creatorInfo?.privacy_level_options?.[0] ?? "SELF_ONLY");
    // For unaudited clients only SELF_ONLY is allowed; we surface that in UI.

    const initEndpoint = getTikTokInitEndpoint(input.mode);

    const initBody = {
      post_info: {
        title: input.caption,
        privacy_level: privacyLevel,
        disable_duet: input.disableDuet ?? false,
        disable_comment: input.disableComment ?? false,
        disable_stitch: input.disableStitch ?? false,
        video_cover_timestamp_ms: 1000
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: videoSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunkCount
      }
    };

    const initResponse = await fetch(initEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify(initBody),
      signal: AbortSignal.timeout(30_000)
    });
    const initText = await initResponse.text();
    if (!initResponse.ok) throw new Error(`TikTok video/init failed HTTP ${initResponse.status}: ${initText.slice(0, 800)}`);
    let initJson: { data?: { publish_id?: string; upload_url?: string }; error?: { message?: string; code?: string } };
    try {
      initJson = JSON.parse(initText) as typeof initJson;
    } catch {
      throw new Error(`TikTok video/init returned non-JSON: ${initText.slice(0, 300)}`);
    }
    if (initJson.error) throw new Error(`TikTok video/init: ${initJson.error.message ?? initJson.error.code}`);
    const publishId = initJson.data?.publish_id;
    const uploadUrl = initJson.data?.upload_url;
    if (!publishId || !uploadUrl) throw new Error("TikTok did not return publish_id / upload_url");

    // Chunked upload via PUT to upload_url; TikTok expects Content-Range header
    const fileHandle = await readFile(input.videoPath);
    for (const c of chunks) {
      const chunk = fileHandle.subarray(c.start, c.end + 1);
      const putResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Range": c.contentRange,
          "Content-Type": "video/mp4",
          "Content-Length": String(c.length)
        },
        body: chunk as unknown as BodyInit,
        signal: AbortSignal.timeout(60_000)
      });
      if (!putResponse.ok) {
        const putText = (await putResponse.text()).slice(0, 500);
        throw new Error(`TikTok chunk upload failed chunk ${c.index + 1}/${totalChunkCount} HTTP ${putResponse.status}: ${sanitizeTikTokError(putText)} url=${sanitizeUploadUrl(uploadUrl)}`);
      }
    }

    // For draft vs direct, both FILE_UPLOAD via init is same; publish_id is identifier. Optionally poll status for direct.
    if (input.mode === "direct") {
      // Poll status fetch briefly; if unaudited, publication will remain processing but privacy will be forced to SELF_ONLY.
      // We don't block indefinitely; just attempt one status check after short delay.
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const statusResponse = await fetch(TIKTOK_VIDEO_STATUS_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ publish_id: publishId }),
          signal: AbortSignal.timeout(15_000)
        });
        if (statusResponse.ok) {
          // ignore result; just ensures API reachable. Real status may be PROCESSING.
        }
      } catch {
        // ignore status fetch failure; publishId still returned
      }
    }

    return publishId;
  }

  private async getAuthorizedToken(): Promise<string> {
    const stored = await this.requireConfigured();
    if (!stored.accessTokenEncrypted) throw new Error("Connect TikTok first");
    if (stored.expiresAt && Date.parse(stored.expiresAt) > Date.now() + 60_000) return this.decrypt(stored.accessTokenEncrypted);
    if (!stored.refreshTokenEncrypted) throw new Error("TikTok refresh token missing; reconnect required");
    const secret = this.decrypt(stored.clientSecretEncrypted);
    const refresh = this.decrypt(stored.refreshTokenEncrypted);
    const tokens = await this.exchangeToken({
      client_key: stored.clientKey,
      client_secret: secret,
      grant_type: "refresh_token",
      refresh_token: refresh
    });
    await this.write({
      ...stored,
      accessTokenEncrypted: this.encrypt(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token ? this.encrypt(tokens.refresh_token) : stored.refreshTokenEncrypted,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      openId: tokens.open_id ?? stored.openId
    } as StoredTikTok);
    return tokens.access_token;
  }

  private async exchangeToken(params: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; expires_in: number; open_id?: string; scope?: string }> {
    const response = await fetch(TIKTOK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(30_000)
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`TikTok token exchange failed HTTP ${response.status}: ${sanitizeTikTokError(text.slice(0, 800))}`);
    let json: { data?: { access_token: string; refresh_token?: string; expires_in: number; open_id?: string; scope?: string }; access_token?: string; refresh_token?: string; expires_in?: number; open_id?: string; scope?: string; error?: { message?: string } };
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      throw new Error(`TikTok token response invalid JSON: ${text.slice(0, 300)}`);
    }
    if (json.error) throw new Error(`TikTok token error: ${json.error.message}`);
    const data = json.data ?? json;
    if (!data.access_token || typeof data.expires_in !== "number") throw new Error("TikTok token response missing access_token");
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      open_id: data.open_id,
      scope: data.scope
    };
  }

  private async requireConfigured(): Promise<StoredTikTok> {
    const stored = await this.read();
    if (!stored?.clientKey || !stored.clientSecretEncrypted) throw new Error("Save TikTok Client Key and Client Secret first");
    return stored;
  }

  private encrypt(value: string): string {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Operating-system credential encryption is unavailable");
    return safeStorage.encryptString(value).toString("base64");
  }
  private decrypt(value: string): string {
    return safeStorage.decryptString(Buffer.from(value, "base64"));
  }
  private async read(): Promise<StoredTikTok | null> {
    try {
      return JSON.parse(await readFile(this.filePath, "utf8")) as StoredTikTok;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  private async write(value: StoredTikTok): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
  }
}
