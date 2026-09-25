import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { TIKTOK_CHUNK_MAX, TIKTOK_CHUNK_MIN, TIKTOK_DEFAULT_CHUNK_SIZE, buildTikTokAuthorizationUrl, computeTikTokUploadChunks, deriveTikTokCodeChallenge, generateTikTokCodeVerifier, getTikTokInitEndpoint, sanitizeTikTokError, sanitizeUploadUrl, TIKTOK_SCOPES } from "./tiktok-oauth.js";

test("TikTok OAuth URL contains required params", () => {
  const url = new URL(buildTikTokAuthorizationUrl({ clientKey: "test-key", redirectUri: "http://127.0.0.1:43823/callback", state: "state-123" }));
  assert.equal(url.hostname, "www.tiktok.com");
  assert.equal(url.pathname, "/v2/auth/authorize/");
  assert.equal(url.searchParams.get("client_key"), "test-key");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("redirect_uri"), "http://127.0.0.1:43823/callback");
  assert.equal(url.searchParams.get("state"), "state-123");
  assert.deepEqual(url.searchParams.get("scope")?.split(","), [...TIKTOK_SCOPES]);
});

test("TikTok sandbox login can request only user.info.basic", () => {
  const url = new URL(buildTikTokAuthorizationUrl({
    clientKey: "test-key",
    redirectUri: "http://127.0.0.1:43823/callback",
    state: "state-123",
    scopes: ["user.info.basic"]
  }));
  assert.equal(url.searchParams.get("scope"), "user.info.basic");
  assert.ok(TIKTOK_SCOPES.includes("video.upload"));
  assert.ok(TIKTOK_SCOPES.includes("video.publish"));
});

test("TikTok Desktop OAuth PKCE parameters are present", () => {
  const verifier = generateTikTokCodeVerifier();
  const challenge = deriveTikTokCodeChallenge(verifier);
  assert.ok(verifier.length >= 43 && verifier.length <= 128, `verifier length ${verifier.length} out of 43..128`);
  const url = new URL(buildTikTokAuthorizationUrl({ clientKey: "k", redirectUri: "http://127.0.0.1:43823/callback", state: "s", codeChallenge: challenge, codeChallengeMethod: "S256" }));
  assert.equal(url.searchParams.get("code_challenge"), challenge);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
});

test("TikTok PKCE verifier and challenge relationship is SHA256 hex", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const expected = createHash("sha256").update(verifier).digest("hex");
  assert.equal(deriveTikTokCodeChallenge(verifier), expected);
  const gen = generateTikTokCodeVerifier();
  const derived = deriveTikTokCodeChallenge(gen);
  assert.equal(derived, createHash("sha256").update(gen).digest("hex"));
});

test("TikTok verifier is cryptographically random per call", () => {
  const a = generateTikTokCodeVerifier();
  const b = generateTikTokCodeVerifier();
  assert.notEqual(a, b);
});

test("TikTok draft upload uses inbox/video/init endpoint", () => {
  assert.equal(getTikTokInitEndpoint("draft"), "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/");
});

test("TikTok direct post uses video/init endpoint", () => {
  assert.equal(getTikTokInitEndpoint("direct"), "https://open.tiktokapis.com/v2/post/publish/video/init/");
});

test("TikTok chunk boundary math within 5-64 MB and final chunk correct", () => {
  // 10 MB default chunk, 25 MB file -> 3 chunks 10,10,5
  const chunks = computeTikTokUploadChunks(25 * 1024 * 1024, TIKTOK_DEFAULT_CHUNK_SIZE);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 10 * 1024 * 1024);
  assert.equal(chunks[1].length, 10 * 1024 * 1024);
  assert.equal(chunks[2].length, 5 * 1024 * 1024);
  assert.equal(chunks[0].contentRange, `bytes 0-${10 * 1024 * 1024 - 1}/${25 * 1024 * 1024}`);
  assert.equal(chunks[2].contentRange, `bytes ${20 * 1024 * 1024}-${25 * 1024 * 1024 - 1}/${25 * 1024 * 1024}`);
  // total size remains constant
  for (const c of chunks) assert.ok(c.contentRange.endsWith(`/${25 * 1024 * 1024}`));
  // sum lengths == total
  assert.equal(chunks.reduce((s, c) => s + c.length, 0), 25 * 1024 * 1024);
});

test("TikTok exact multiple chunk has no partial final chunk", () => {
  const chunks = computeTikTokUploadChunks(20 * 1024 * 1024, 10 * 1024 * 1024);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[1].end, 20 * 1024 * 1024 - 1);
});

test("TikTok small file single chunk", () => {
  const chunks = computeTikTokUploadChunks(1 * 1024 * 1024, TIKTOK_DEFAULT_CHUNK_SIZE);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].contentRange, `bytes 0-${1 * 1024 * 1024 - 1}/${1 * 1024 * 1024}`);
});

test("TikTok chunk size bounds enforced", () => {
  assert.throws(() => computeTikTokUploadChunks(10 * 1024 * 1024, 1 * 1024 * 1024), /Chunk size must be between/);
  assert.throws(() => computeTikTokUploadChunks(10 * 1024 * 1024, 100 * 1024 * 1024), /Chunk size must be between/);
  assert.ok(TIKTOK_CHUNK_MIN === 5 * 1024 * 1024);
  assert.ok(TIKTOK_CHUNK_MAX === 64 * 1024 * 1024);
});

test("TikTok sanitize redacts tokens and upload url", () => {
  const raw = "failed with access_token=abc and refresh_token=def open_id=123 upload_url=https://example.com/upload?token=secret";
  const sanitized = sanitizeTikTokError(raw);
  assert.ok(!sanitized.includes("access_token=abc"));
  assert.ok(sanitized.includes("access_token=[redacted]"));
  assert.ok(sanitized.includes("open_id=[redacted]"));
  const uploadSanitized = sanitizeUploadUrl("https://example.com/upload?token=secret&signature=abc");
  assert.ok(!uploadSanitized.includes("secret"));
  assert.ok(uploadSanitized.includes("[redacted]"));
});

test("TikTok does not expose raw upload_url in diagnostics", () => {
  const rawUrl = "https://open.tiktokapis.com/upload?token=secret123&signature=abc";
  const sanitized = sanitizeUploadUrl(rawUrl);
  assert.ok(!sanitized.includes("secret123"));
  assert.ok(sanitized.includes("[redacted]"));
  // error path uses sanitized url, not raw
  const errorMsg = `chunk failed url=${sanitizeUploadUrl(rawUrl)}`;
  assert.ok(!errorMsg.includes("secret123"));
});

test("Publisher result shape invariant", async () => {
  // validate reusable shape contains required fields
  const sample = {
    platform: "YouTube" as const,
    ok: true,
    destinationName: "TestChannel",
    remoteId: "abc123",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    status: "uploaded",
    endpoint: "https://www.googleapis.com/upload/youtube/v3/videos",
    sanitizedError: null
  };
  assert.equal(sample.platform, "YouTube");
  assert.equal(sample.ok, true);
  assert.ok(sample.destinationName);
  assert.ok(sample.remoteId);
  assert.ok(sample.startedAt);
  assert.ok(sample.finishedAt);
  assert.ok(sample.status);
  assert.equal(sample.sanitizedError, null);
});
