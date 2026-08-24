import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeStorage, shell } from "electron";
import type { SpotifyConnection } from "../shared/contracts.js";

const callbackUrl = "http://127.0.0.1:43821/callback";
interface StoredSpotify { clientId: string; accessTokenEncrypted?: string; refreshTokenEncrypted?: string; expiresAt?: string; accountId?: string; displayName?: string; }

export class SpotifyClient {
  private pending: { state: string; verifier: string } | null = null;
  private lastError: string | null = null;
  private readonly filePath: string;
  constructor(userDataPath: string) { this.filePath = path.join(userDataPath, "integrations", "spotify.json"); }
  async status(): Promise<SpotifyConnection> { const value = await this.read(); return { configured: Boolean(value?.clientId), connected: Boolean(value?.accessTokenEncrypted && value.refreshTokenEncrypted), accountId: value?.accountId ?? null, displayName: value?.displayName ?? null, callbackUrl, error: this.lastError }; }
  async saveClientId(clientId: string): Promise<SpotifyConnection> { if (!clientId.trim()) throw new Error("Spotify Client ID is required"); const current = await this.read(); await this.write({ ...current, clientId: clientId.trim() }); return this.status(); }
  async beginConnect(): Promise<void> {
    const stored = await this.requireConfigured(); this.lastError = null;
    const verifier = randomBytes(48).toString("base64url"), challenge = createHash("sha256").update(verifier).digest("base64url"), state = randomBytes(24).toString("hex"); this.pending = { verifier, state };
    const server = createServer(async (request, response) => { if (!request.url?.startsWith("/callback")) { response.writeHead(404).end(); return; } try { await this.handleCallback(new URL(request.url, callbackUrl)); response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); response.end("<h1>Spotify connected</h1><p>You can close this window and return to AI Music Manager.</p>"); } catch (error) { this.lastError = error instanceof Error ? error.message : "Spotify authorization failed"; response.writeHead(400, { "Content-Type": "text/plain" }); response.end(this.lastError); } finally { server.close(); } });
    await new Promise<void>((resolve, reject) => server.once("error", reject).listen(43821, "127.0.0.1", resolve));
    setTimeout(() => { if (server.listening) { this.lastError = "Spotify authorization timed out"; server.close(); } }, 120_000).unref();
    const url = new URL("https://accounts.spotify.com/authorize"); url.search = new URLSearchParams({ client_id: stored.clientId, response_type: "code", redirect_uri: callbackUrl, code_challenge_method: "S256", code_challenge: challenge, state, scope: "user-read-private" }).toString(); await shell.openExternal(url.toString());
  }
  private async handleCallback(url: URL): Promise<void> { const code = url.searchParams.get("code"), state = url.searchParams.get("state"); if (!code || !state || !this.pending || state !== this.pending.state) throw new Error("Invalid or expired Spotify callback"); const stored = await this.requireConfigured(); const tokens = await this.exchange(new URLSearchParams({ client_id: stored.clientId, grant_type: "authorization_code", code, redirect_uri: callbackUrl, code_verifier: this.pending.verifier })); if (!tokens.refresh_token) throw new Error("Spotify did not return a refresh token"); this.pending = null; const profile = await this.fetchJson("https://api.spotify.com/v1/me", tokens.access_token) as { id: string; display_name?: string }; await this.write({ ...stored, accessTokenEncrypted: this.encrypt(tokens.access_token), refreshTokenEncrypted: this.encrypt(tokens.refresh_token), expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), accountId: profile.id, displayName: profile.display_name ?? profile.id }); }
  async token(): Promise<string> { const stored = await this.requireConfigured(); if (!stored.accessTokenEncrypted || !stored.refreshTokenEncrypted) throw new Error("Connect Spotify first"); if (stored.expiresAt && Date.parse(stored.expiresAt) > Date.now() + 60_000) return this.decrypt(stored.accessTokenEncrypted); const tokens = await this.exchange(new URLSearchParams({ client_id: stored.clientId, grant_type: "refresh_token", refresh_token: this.decrypt(stored.refreshTokenEncrypted) })); await this.write({ ...stored, accessTokenEncrypted: this.encrypt(tokens.access_token), refreshTokenEncrypted: this.encrypt(tokens.refresh_token ?? this.decrypt(stored.refreshTokenEncrypted)), expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString() }); return tokens.access_token; }
  async fetchArtistReleases(artistId: string): Promise<unknown[]> { const token = await this.token(); let next: string | null = `https://api.spotify.com/v1/artists/${encodeURIComponent(artistId)}/albums?include_groups=album,single,appears_on,compilation&limit=10`; const result: unknown[] = []; while (next) { const page = await this.fetchJson(next, token) as { items?: unknown[]; next?: string | null }; result.push(...(page.items ?? [])); next = page.next ?? null; } return result; }
  async disconnect(): Promise<SpotifyConnection> { const stored = await this.read(); if (stored) await this.write({ clientId: stored.clientId }); return this.status(); }
  private async exchange(body: URLSearchParams): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> { const response = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`Spotify token exchange failed with HTTP ${response.status}`); return response.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>; }
  private async fetchJson(url: string, token: string): Promise<unknown> { const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) { const body = (await response.text()).slice(0, 500); throw new Error(`Spotify API returned HTTP ${response.status}${body ? `: ${body}` : ""}`); } return response.json(); }
  private async requireConfigured(): Promise<StoredSpotify> { const value = await this.read(); if (!value?.clientId) throw new Error("Save Spotify Client ID first"); return value; }
  private encrypt(value: string): string { if (!safeStorage.isEncryptionAvailable()) throw new Error("Operating-system encryption is unavailable"); return safeStorage.encryptString(value).toString("base64"); }
  private decrypt(value: string): string { return safeStorage.decryptString(Buffer.from(value, "base64")); }
  private async read(): Promise<StoredSpotify | null> { try { return JSON.parse(await readFile(this.filePath, "utf8")) as StoredSpotify; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } }
  private async write(value: StoredSpotify): Promise<void> { await mkdir(path.dirname(this.filePath), { recursive: true }); await writeFile(this.filePath, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 }); }
}
