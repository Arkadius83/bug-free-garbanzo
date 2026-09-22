export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/yt-analytics.readonly"
] as const;

export function buildYouTubeAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: (input.scopes ?? [...YOUTUBE_SCOPES]).join(" "),
    access_type: "offline",
    prompt: "consent",
    state: input.state,
    include_granted_scopes: "true"
  }).toString();
  return url.toString();
}

export function sanitizeYouTubeError(message: string): string {
  return message
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replace(/refresh_token=[^&\s]+/gi, "refresh_token=[redacted]")
    .replace(/client_secret=[^&\s]+/gi, "client_secret=[redacted]")
    .replace(/code=[^&\s]+/gi, "code=[redacted]");
}
