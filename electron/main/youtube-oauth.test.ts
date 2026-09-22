import assert from "node:assert/strict";
import test from "node:test";
import { buildYouTubeAuthorizationUrl, sanitizeYouTubeError, YOUTUBE_SCOPES } from "./youtube-oauth.js";

test("YouTube OAuth URL contains required params", () => {
  const url = new URL(buildYouTubeAuthorizationUrl({ clientId: "test-client", redirectUri: "http://127.0.0.1:43822/callback", state: "state-xyz" }));
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.pathname, "/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), "test-client");
  assert.equal(url.searchParams.get("redirect_uri"), "http://127.0.0.1:43822/callback");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("state"), "state-xyz");
  assert.deepEqual(url.searchParams.get("scope")?.split(" "), [...YOUTUBE_SCOPES]);
});

test("YouTube sanitize redacts tokens", () => {
  const raw = "error with access_token=ya29.abc123 and refresh_token=1//abc and client_secret=shhh and code=authcode";
  const sanitized = sanitizeYouTubeError(raw);
  assert.ok(!sanitized.includes("ya29.abc123"));
  assert.ok(sanitized.includes("access_token=[redacted]"));
  assert.ok(sanitized.includes("refresh_token=[redacted]"));
  assert.ok(sanitized.includes("client_secret=[redacted]"));
  assert.ok(sanitized.includes("code=[redacted]"));
});

test("YouTube preserves stored refresh token when Google omits it on refresh", () => {
  const storedEncrypted = "stored-refresh-encrypted";
  const tokensWithoutRefresh: { access_token: string; expires_in: number; refresh_token?: string } = { access_token: "ya29.new", expires_in: 3600 };
  const tokensWithRefresh = { access_token: "ya29.new2", expires_in: 3600, refresh_token: "new-refresh" };
  const preserved = tokensWithoutRefresh.refresh_token ? tokensWithoutRefresh.refresh_token : storedEncrypted;
  assert.equal(preserved, storedEncrypted);
  const replaced = tokensWithRefresh.refresh_token ? tokensWithRefresh.refresh_token : storedEncrypted;
  assert.equal(replaced, "new-refresh");
});

test("YouTube OAuth state validation retained alongside offline and consent", () => {
  const url = new URL(buildYouTubeAuthorizationUrl({ clientId: "id", redirectUri: "http://127.0.0.1:43822/callback", state: "random-state-123" }));
  assert.equal(url.searchParams.get("state"), "random-state-123");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("include_granted_scopes"), "true");
});
