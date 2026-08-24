import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeStorage, shell } from "electron";
import type { SoundCloudConnection } from "../shared/contracts.js";

const callbackUrl = "ai-studio-manager://soundcloud/callback";

interface StoredSoundCloud {
  clientId: string;
  clientSecretEncrypted: string;
  accessTokenEncrypted?: string;
  refreshTokenEncrypted?: string;
  expiresAt?: string;
  userId?: number;
  username?: string;
  permalinkUrl?: string;
}

export class SoundCloudClient {
  private pending: { state: string; verifier: string } | null = null;
  private lastError: string | null = null;
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, "integrations", "soundcloud.json");
  }

  async status(): Promise<SoundCloudConnection> {
    const stored = await this.readStored();
    return {
      configured: Boolean(stored?.clientId && stored.clientSecretEncrypted),
      connected: Boolean(stored?.accessTokenEncrypted && stored.refreshTokenEncrypted && stored.userId),
      userId: stored?.userId ?? null,
      username: stored?.username ?? null,
      permalinkUrl: stored?.permalinkUrl ?? null,
      tokenExpiresAt: stored?.expiresAt ?? null,
      callbackUrl, error: this.lastError
    };
  }

  async saveCredentials(clientId: string, clientSecret: string): Promise<SoundCloudConnection> {
    if (!clientId.trim() || !clientSecret.trim()) throw new Error("SoundCloud client ID and client secret are required");
    const current = await this.readStored();
    await this.writeStored({ ...current, clientId: clientId.trim(), clientSecretEncrypted: this.encrypt(clientSecret.trim()) });
    return this.status();
  }

  async beginConnect(): Promise<void> {
    this.lastError = null;
    const stored = await this.requireConfigured();
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const state = randomBytes(24).toString("hex");
    this.pending = { state, verifier };
    const url = new URL("https://secure.soundcloud.com/authorize");
    url.searchParams.set("client_id", stored.clientId);
    url.searchParams.set("redirect_uri", callbackUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    await shell.openExternal(url.toString());
  }

  async handleCallback(rawUrl: string): Promise<void> {
    try {
    const callback = new URL(rawUrl);
    const code = callback.searchParams.get("code");
    const state = callback.searchParams.get("state");
    const error = callback.searchParams.get("error");
    if (error) throw new Error("SoundCloud authorization failed: " + error);
    if (!code || !state || !this.pending || state !== this.pending.state) throw new Error("Invalid or expired SoundCloud authorization callback");
    const stored = await this.requireConfigured();
    const tokens = await this.exchangeToken({
      grant_type: "authorization_code", client_id: stored.clientId, client_secret: this.decrypt(stored.clientSecretEncrypted),
      redirect_uri: callbackUrl, code_verifier: this.pending.verifier, code
    });
    this.pending = null;
    const profile = await this.fetchJson("https://api.soundcloud.com/me", tokens.access_token) as { id: number; username: string; permalink_url: string };
    await this.writeStored({
      ...stored, accessTokenEncrypted: this.encrypt(tokens.access_token), refreshTokenEncrypted: this.encrypt(tokens.refresh_token),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), userId: profile.id, username: profile.username, permalinkUrl: profile.permalink_url
    });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "SoundCloud authorization failed";
      throw error;
    }
  }

  async disconnect(): Promise<SoundCloudConnection> {
    const stored = await this.readStored();
    if (stored) await this.writeStored({ clientId: stored.clientId, clientSecretEncrypted: stored.clientSecretEncrypted });
    return this.status();
  }

  async getAuthorizedToken(): Promise<string> {
    const stored = await this.requireConfigured();
    if (!stored.accessTokenEncrypted || !stored.refreshTokenEncrypted) throw new Error("Connect the SoundCloud account first");
    if (stored.expiresAt && Date.parse(stored.expiresAt) > Date.now() + 60_000) return this.decrypt(stored.accessTokenEncrypted);
    const tokens = await this.exchangeToken({
      grant_type: "refresh_token", client_id: stored.clientId, client_secret: this.decrypt(stored.clientSecretEncrypted),
      refresh_token: this.decrypt(stored.refreshTokenEncrypted)
    });
    await this.writeStored({
      ...stored, accessTokenEncrypted: this.encrypt(tokens.access_token), refreshTokenEncrypted: this.encrypt(tokens.refresh_token),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    });
    return tokens.access_token;
  }

  async fetchAllTracks(): Promise<unknown[]> {
    const token = await this.getAuthorizedToken();
    let next: string | null = "https://api.soundcloud.com/me/tracks?linked_partitioning=true&limit=200";
    const tracks: unknown[] = [];
    while (next) {
      const page = await this.fetchJson(next, token) as { collection?: unknown[]; next_href?: string | null };
      tracks.push(...(page.collection ?? []));
      next = page.next_href ?? null;
    }
    return tracks;
  }

  private async exchangeToken(parameters: Record<string, string>): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    const response = await fetch("https://secure.soundcloud.com/oauth/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams(parameters), signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) throw new Error("SoundCloud token exchange failed with HTTP " + response.status);
    return await response.json() as { access_token: string; refresh_token: string; expires_in: number };
  }

  private async fetchJson(url: string, token: string): Promise<unknown> {
    const response = await fetch(url, { headers: { Authorization: "OAuth " + token, accept: "application/json; charset=utf-8" }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error("SoundCloud API returned HTTP " + response.status);
    return response.json();
  }

  private async requireConfigured(): Promise<StoredSoundCloud> {
    const stored = await this.readStored();
    if (!stored?.clientId || !stored.clientSecretEncrypted) throw new Error("Save SoundCloud API credentials first");
    return stored;
  }

  private encrypt(value: string): string {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Operating-system encryption is unavailable; credentials were not saved");
    return safeStorage.encryptString(value).toString("base64");
  }

  private decrypt(value: string): string { return safeStorage.decryptString(Buffer.from(value, "base64")); }

  private async readStored(): Promise<StoredSoundCloud | null> {
    try { return JSON.parse(await readFile(this.filePath, "utf8")) as StoredSoundCloud; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }

  private async writeStored(value: StoredSoundCloud): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
  }
}
