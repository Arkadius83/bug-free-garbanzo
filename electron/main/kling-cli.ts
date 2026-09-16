import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GeneratedMediaType, MediaAspectRatio } from "../shared/contracts.js";

const execFileAsync = promisify(execFile);

export interface KlingCliCommandResult {
  stdout: string;
  stderr: string;
}

export type KlingCliRunner = (args: string[], timeoutMs?: number) => Promise<KlingCliCommandResult>;

export interface KlingCliStatus {
  installed: boolean;
  authenticated: boolean;
  accountLabel: string | null;
  error: string | null;
}

export interface KlingCliGenerationResult {
  providerTaskId: string;
  remoteUrl?: string;
  metadata: Record<string, unknown>;
}

const defaultRunner: KlingCliRunner = async (args, timeoutMs = 30_000) => {
  const options = {
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env }
  };
  const result = process.platform === "win32"
    ? await execFileAsync(
        process.env.ComSpec ?? "cmd.exe",
        ["/d", "/s", "/c", "powershell.exe -NoProfile -NonInteractive -Command \"$a=ConvertFrom-Json $env:AI_STUDIO_KLING_ARGS; & kling @a\""],
        { ...options, env: { ...options.env, AI_STUDIO_KLING_ARGS: JSON.stringify(args) } }
      )
    : await execFileAsync("kling", args, options);
  return { stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? "") };
};

function combinedOutput(result: KlingCliCommandResult): string {
  return `${result.stdout}\n${result.stderr}`.trim();
}

function errorText(error: unknown): string {
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; message?: unknown; stderr?: unknown; stdout?: unknown };
    if (value.code === "ENOENT") return "Kling CLI is not installed or is not available on PATH";
    const details = `${String(value.stderr ?? "")}\n${String(value.stdout ?? "")}`.trim();
    if (details) return details;
    if (typeof value.message === "string") return value.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function tryJson(text: string): unknown {
  const candidates = [text.trim()];
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(text.slice(objectStart, objectEnd + 1));
  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(text.slice(arrayStart, arrayEnd + 1));
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch { /* CLI output may be human-readable. */ }
  }
  return null;
}

function findStringByKeys(value: unknown, keys: Set<string>): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findStringByKeys(item, keys);
      if (match) return match;
    }
    return null;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(key.toLowerCase()) && typeof item === "string" && item.trim()) return item.trim();
    const nested = findStringByKeys(item, keys);
    if (nested) return nested;
  }
  return null;
}

function extractGenerationId(text: string): string | null {
  const parsed = tryJson(text);
  const fromJson = findStringByKeys(parsed, new Set(["generation_id", "generationid", "task_id", "taskid", "id"]));
  if (fromJson) return fromJson;
  const patterns = [
    /generation[_\s-]*id\s*[:=]\s*["']?([A-Za-z0-9_-]{6,})/i,
    /task[_\s-]*id\s*[:=]\s*["']?([A-Za-z0-9_-]{6,})/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractResultUrl(text: string): string | null {
  const parsed = tryJson(text);
  const fromJson = findStringByKeys(parsed, new Set(["url", "result_url", "resulturl", "download_url", "downloadurl"]));
  if (fromJson && /^https?:\/\//i.test(fromJson)) return fromJson;
  const urls = text.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  return urls.find((url) => /\.(png|jpe?g|webp|mp4)(?:\?|$)/i.test(url)) ?? urls[0] ?? null;
}

function isUnauthenticated(text: string): boolean {
  return /(not\s+logged\s+in|login\s+required|please\s+login|unauthori[sz]ed|authentication\s+required)/i.test(text);
}

function isFailedTask(text: string): boolean {
  return /("status"\s*:\s*"(?:failed|error)"|\bstatus\s*[:=]\s*(?:failed|error)\b|generation\s+failed|task\s+failed)/i.test(text);
}

function accountLabel(text: string): string | null {
  const parsed = tryJson(text);
  return findStringByKeys(parsed, new Set(["email", "username", "name", "user_name", "display_name"]));
}

export class KlingCliClient {
  constructor(private readonly runCommand: KlingCliRunner = defaultRunner) {}

  async status(): Promise<KlingCliStatus> {
    try {
      await this.runCommand(["--help"], 10_000);
    } catch (error) {
      return { installed: false, authenticated: false, accountLabel: null, error: errorText(error) };
    }

    try {
      const result = await this.runCommand(["who_am_i"], 20_000);
      const output = combinedOutput(result);
      if (isUnauthenticated(output)) {
        return { installed: true, authenticated: false, accountLabel: null, error: "Kling CLI is installed but not logged in. Run `kling login`." };
      }
      return { installed: true, authenticated: true, accountLabel: accountLabel(output), error: null };
    } catch (error) {
      const message = errorText(error);
      return {
        installed: true,
        authenticated: false,
        accountLabel: null,
        error: isUnauthenticated(message) ? "Kling CLI is installed but not logged in. Run `kling login`." : message
      };
    }
  }

  async createTask(mediaType: GeneratedMediaType, prompt: string, aspectRatio: MediaAspectRatio): Promise<KlingCliGenerationResult> {
    const command = mediaType === "video" ? "text_to_video" : "text_to_image";
    const promptWithFormat = `${prompt}\nOutput aspect ratio: ${aspectRatio}.`;
    let result: KlingCliCommandResult;
    try {
      result = await this.runCommand([command, promptWithFormat], 120_000);
    } catch (error) {
      throw new Error(`Kling CLI ${command} failed: ${errorText(error)}`);
    }
    const output = combinedOutput(result);
    if (isUnauthenticated(output)) throw new Error("Kling CLI is not logged in. Run `kling login` and try again.");
    const providerTaskId = extractGenerationId(output);
    if (!providerTaskId) throw new Error(`Kling CLI returned no generation_id. Output: ${output.slice(0, 600)}`);
    return {
      providerTaskId,
      metadata: { transport: "kling-cli", command, aspectRatio, klingStatus: "submitted" }
    };
  }

  async queryTask(generationId: string): Promise<KlingCliGenerationResult | null> {
    let result: KlingCliCommandResult;
    try {
      result = await this.runCommand(["query_tasks", generationId], 60_000);
    } catch (error) {
      throw new Error(`Kling CLI query_tasks failed: ${errorText(error)}`);
    }
    const output = combinedOutput(result);
    if (isUnauthenticated(output)) throw new Error("Kling CLI is not logged in. Run `kling login` and try again.");
    if (isFailedTask(output)) throw new Error(`Kling generation failed: ${output.slice(0, 600)}`);
    const remoteUrl = extractResultUrl(output);
    if (!remoteUrl) return null;
    return {
      providerTaskId: generationId,
      remoteUrl,
      metadata: { transport: "kling-cli", klingStatus: "ready" }
    };
  }
}

export const klingCliParsing = { extractGenerationId, extractResultUrl, isUnauthenticated, isFailedTask };
