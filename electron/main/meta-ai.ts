import { spawn, ChildProcess, SpawnOptions } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MetaAiGenerateResult, MetaAiSession, MetaAiStatus } from "../shared/contracts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CLI_DIR = path.join(__dirname, "..", "..", "meta-ai-cli");

export class MetaAiClient {
  private readonly sessionPath: string;
  private readonly cliDir: string;
  private process: ChildProcess | null = null;
  private lastError: string | undefined = undefined;

  constructor(userDataPath: string, cliDir?: string) {
    this.sessionPath = path.join(userDataPath, "integrations", "meta-ai-session.json");
    this.cliDir = cliDir ?? DEFAULT_CLI_DIR;
  }

  async status(): Promise<MetaAiStatus> {
    try {
      const session = await this.readSession();
      const denoAvailable = await this.checkDeno();
      const sessionValid = session && this.hasSessionCookie(session);
      return {
        configured: Boolean(sessionValid),
        available: denoAvailable,
        sessionPath: this.sessionPath,
        error: this.lastError,
      };
    } catch (error) {
      return { configured: false, available: false, sessionPath: this.sessionPath, error: error instanceof Error ? error.message : "Unknown Meta AI error" };
    }
  }

  async generateImage(prompt: string, aspect: string, count: number): Promise<MetaAiGenerateResult> {
    await this.requireSession();
    const outputDir = await this.getOutputDir();
    const args = ["run", "-A", "cli.ts", "--json", "--session-path", this.sessionPath, "image", "create", "--prompt", prompt, "--aspect", aspect, "--count", String(count), "--image-out", outputDir];
    try {
      const result = await this.runCli(args, "image generation");
      if (!Array.isArray(result.images) || result.images.length === 0) {
        throw new Error(`Meta AI CLI finished without saving any image. ${result.message ?? ""}`.trim());
      }
      return result;
    } catch (error) {
      throw this.withOutputLocation(error, outputDir);
    }
  }

  async generateVideo(prompt: string, aspect: string): Promise<MetaAiGenerateResult> {
    await this.requireSession();
    const outputDir = await this.getOutputDir();
    const args = ["run", "-A", "cli.ts", "--json", "--session-path", this.sessionPath, "video", "create", "--prompt", prompt, "--aspect", aspect, "--video-out", outputDir];
    try {
      const result = await this.runCli(args, "video generation");
      if (!Array.isArray(result.videos) || result.videos.length === 0) {
        throw new Error(`Meta AI CLI finished without saving any video. ${result.message ?? ""}`.trim());
      }
      return result;
    } catch (error) {
      throw this.withOutputLocation(error, outputDir);
    }
  }

  private withOutputLocation(error: unknown, outputDir: string): Error {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(outputDir)) return error instanceof Error ? error : new Error(message);
    return new Error(`${message}\nOutput directory: ${outputDir}`);
  }

  async login(): Promise<MetaAiSession> {
    const session = await this.readSession();
    const hasSession = session && this.hasSessionCookie(session);
    if (hasSession) return session;
    const args = ["run", "-A", "cli.ts", "--json", "--session-path", this.sessionPath, "auth", "login"];
    const result = await this.runCli(args, "Meta AI login");
    const saved = await this.readSession();
    if (!saved || !this.hasSessionCookie(saved)) throw new Error("Meta AI login did not produce a valid session");
    return saved;
  }

  async disconnect(): Promise<MetaAiStatus> {
    try {
      await rm(this.sessionPath, { force: true });
      this.lastError = undefined;
      return await this.status();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Could not disconnect Meta AI";
      return await this.status();
    }
  }

  getCliDir(): string {
    return this.cliDir;
  }

  private async requireSession(): Promise<MetaAiSession> {
    const session = await this.readSession();
    if (!session || !this.hasSessionCookie(session)) throw new Error("Meta AI session not configured. Complete login in Settings first.");
    return session;
  }

  private async runCli(args: string[], operation: string): Promise<MetaAiGenerateResult> {
    return new Promise((resolve, reject) => {
      const spawnArgs = [...args];
      const spawnOptions: SpawnOptions = {
        cwd: this.cliDir,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 10 * 60 * 1000,
      };
      const proc = spawn("deno", spawnArgs, spawnOptions);
      this.process = proc;

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => { stdout += data.toString(); });
      proc.stderr?.on("data", (data) => { stderr += data.toString(); });

      proc.on("close", (code) => {
        this.process = null;
        if (code !== 0) {
          this.lastError = stderr.trim() || `Meta AI CLI exited with code ${code}`;
          reject(new Error(this.lastError));
          return;
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          if (parsed.ok === false) {
            this.lastError = parsed.message || `${operation} failed`;
            reject(new Error(this.lastError));
            return;
          }
          resolve(parsed as MetaAiGenerateResult);
        } catch {
          this.lastError = `Could not parse Meta AI CLI response`;
          reject(new Error(this.lastError));
        }
      });

      proc.on("error", (error) => {
        this.process = null;
        this.lastError = `Failed to launch Meta AI CLI: ${error.message}. Ensure deno is installed and on PATH.`;
        reject(new Error(this.lastError));
      });

      proc.on("timeout", () => {
        proc.kill("SIGTERM");
        this.process = null;
        this.lastError = `${operation} timed out after 10 minutes`;
        reject(new Error(this.lastError));
      });
    });
  }

  private async checkDeno(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn("deno", ["--version"], { timeout: 5000 });
      proc.on("close", (code) => resolve(code === 0));
      proc.on("error", () => resolve(false));
    });
  }

  private async readSession(): Promise<MetaAiSession | null> {
    try {
      const data = await readFile(this.sessionPath, "utf8");
      return JSON.parse(data) as MetaAiSession;
    } catch {
      return null;
    }
  }

  private async getOutputDir(): Promise<string> {
    const dir = path.join(this.cliDir, "output");
    await mkdir(dir, { recursive: true });
    return dir;
  }

  private hasSessionCookie(session: MetaAiSession): boolean {
    return Boolean(session && session.cookies && session.cookies.some((c) => c.domain && c.domain.includes("meta.ai") && c.value && c.value.length > 0));
  }
}
