import type { ConversationChunk, ConversationMessage, ConversationRequest, ConversationResponse, ProviderExecutionTrace } from "../shared/contracts.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
export type ConversationErrorCode = "PROVIDER_UNAVAILABLE" | "CONFIGURATION_ERROR" | "TIMEOUT" | "CANCELLED" | "STREAM_INTERRUPTED" | "INVALID_REQUEST";

export type ConversationProviderName = "opencode-http" | "ollama" | "codex-cli";
export type ConversationProviderAttempt = {
  provider: ConversationProviderName;
  model: string;
  label: string;
  ok: boolean;
  durationMs: number;
  errorType?: string;
  errorMessage?: string;
};


export type ConversationProviderRouteResult = {
  ok: boolean;
  provider?: ConversationProviderName;
  model?: string;
  output?: string;
  durationMs: number;
  attempts: ConversationProviderAttempt[];
  errorMessage?: string;
  trace?: ProviderExecutionTrace;
};
export type ConversationProviderRouter = (prompt: string, options?: { signal?: AbortSignal }) => Promise<ConversationProviderRouteResult>;

export class ConversationRuntimeError extends Error {
  constructor(public readonly code: ConversationErrorCode, message: string) { super(message); }
}

const MAX_HISTORY_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 6000;
const MAX_CONTEXT_CHARS = 1200;

export function normalizeConversationHistory(history: unknown, limit = MAX_HISTORY_MESSAGES): ConversationMessage[] {
  if (!Array.isArray(history)) return [];
  return history.flatMap((item): ConversationMessage[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<ConversationMessage>;
    if ((candidate.role !== "user" && candidate.role !== "assistant") || typeof candidate.content !== "string" || !candidate.content.trim()) return [];
    return [{ id: typeof candidate.id === "string" && candidate.id ? candidate.id : `history-${candidate.role}`, role: candidate.role, content: candidate.content.slice(0, MAX_MESSAGE_CHARS), createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : "" }];
  }).slice(-Math.max(0, limit));
}

export function buildConversationMessages(input: ConversationRequest): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const workspace = input.workspace;
  const context = [
    `Project: ${workspace.projectName || "AI Studio Manager"}`,
    `Artist: ${workspace.artistName || "Unknown artist"}`,
    `Alias: ${workspace.artistId}`,
    workspace.releaseTitle ? `Active release: ${workspace.releaseTitle}` : "Active release: none selected",
    workspace.primaryGenre ? `Genre: ${workspace.primaryGenre}` : null,
    workspace.releaseStatus ? `Release status: ${workspace.releaseStatus}` : null
  ].filter(Boolean).join("\n").slice(0, MAX_CONTEXT_CHARS);
  return [
    { role: "system", content: ["You are AI Studio Manager, a practical music-release and marketing assistant.", "Help with conversation, planning, writing, and decisions only.", "Do not claim to publish, upload, contact people, execute files, inspect the filesystem, or use hidden tools.", "The workspace context below is passive background only. Use it only when the current user request is clearly about the project, artist, release, music promotion, or related work.", "For casual greetings, general questions, translations, or unrelated topics, answer normally without introducing the active project, release, artist, genre, or campaign context.", "Do not assume access to files or scan projects.", context].join("\n") },
    ...normalizeConversationHistory(input.history).map((message) => ({ role: message.role, content: message.content })),
    { role: "user", content: input.message.slice(0, MAX_MESSAGE_CHARS) }
  ];
}

export function buildConversationPrompt(input: ConversationRequest): string {
  return buildConversationMessages(input).map((message) => `${message.role.toUpperCase()}:\n${message.content}`).join("\n\n");
}

export function humanizeConversationError(error: unknown): string {
  if (error instanceof ConversationRuntimeError) return error.message;
  if (error instanceof DOMException && error.name === "AbortError") return "The response was stopped.";
  if (error instanceof Error && /abort/i.test(error.name)) return "The response was stopped.";
  if (error instanceof Error && /timeout/i.test(error.message)) return "The model route took too long to respond. Try again after the providers warm up.";
  if (error instanceof Error && /fetch failed|ECONNREFUSED|UND_ERR_SOCKET/i.test(error.message)) return "Local AI is offline. Start Ollama or switch to Auto routing.";
  return error instanceof Error ? error.message : "AI Studio could not generate a response.";
}

function requireValidRequest(input: ConversationRequest): string | null {
  if (!input || typeof input !== "object") throw new ConversationRuntimeError("INVALID_REQUEST", "The conversation request was invalid.");
  if (typeof input.requestId !== "string" || !input.requestId.trim()) throw new ConversationRuntimeError("INVALID_REQUEST", "A request id is required.");
  if (typeof input.message !== "string" || !input.message.trim()) throw new ConversationRuntimeError("INVALID_REQUEST", "Enter a message first.");
  if (input.model !== null && (typeof input.model !== "string" || !input.model.trim())) throw new ConversationRuntimeError("CONFIGURATION_ERROR", "Choose Auto or an available local AI model before sending.");
  return typeof input.model === "string" ? input.model.trim() : null;
}

function stripThinking(value: string): string { return value.replace(/<think>[\s\S]*?<\/think>\s*/gi, "").trim(); }

function routeFailureMessage(result: ConversationProviderRouteResult): string {
  const attempts = result.attempts.map((attempt) => `${attempt.label}: ${attempt.errorType ?? "failed"}`).join("; ");
  return result.errorMessage || (attempts ? `No provider could answer. Attempts: ${attempts}` : "No provider could answer the message.");
}

async function runAutoRoutedConversation(input: ConversationRequest, options: { signal?: AbortSignal; onChunk?: (chunk: ConversationChunk) => void; providerRouter?: ConversationProviderRouter }): Promise<ConversationResponse> {
  if (!options.providerRouter) throw new ConversationRuntimeError("CONFIGURATION_ERROR", "Automatic provider routing is unavailable.");
  const startTime = Date.now();
  console.log("[conversation] Auto routing started for requestId=" + input.requestId + " messageLength=" + input.message.length);
  const result = await options.providerRouter(buildConversationPrompt(input), { signal: options.signal });
  const totalMs = Date.now() - startTime;
  console.log("[conversation] Auto routing completed: ok=" + result.ok + " provider=" + (result.provider ?? "none") + " model=" + (result.model ?? "none") + " attempts=" + result.attempts.length + " totalMs=" + totalMs);
  if (!result.ok || !result.output?.trim()) throw new ConversationRuntimeError("PROVIDER_UNAVAILABLE", routeFailureMessage(result));
  const content = stripThinking(result.output);
  if (!content) throw new ConversationRuntimeError("PROVIDER_UNAVAILABLE", "The selected provider returned an empty response.");
  options.onChunk?.({ requestId: input.requestId, content, done: false });
  options.onChunk?.({ requestId: input.requestId, content: "", done: true });
  return { requestId: input.requestId, provider: result.provider ?? "auto", model: result.model ?? "auto", content, streamed: false, interrupted: false, trace: result.trace };
}

async function runLocalOllamaConversation(input: ConversationRequest, model: string, options: { fetchImpl?: FetchLike; signal?: AbortSignal; onChunk?: (chunk: ConversationChunk) => void; timeoutMs?: number }): Promise<ConversationResponse> {
  const stream = input.stream !== false;
  const controller = new AbortController();
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 300_000);
  const signal = AbortSignal.any([controller.signal, timeout, ...(options.signal ? [options.signal] : [])]);
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ model, stream, think: false, keep_alive: "15m", options: { temperature: 0.45, top_p: 0.88, num_ctx: 4096, num_predict: model.toLowerCase().startsWith("deepseek-r1") ? 1200 : 700 }, messages: buildConversationMessages(input) })
    });
    if (!response.ok) throw new ConversationRuntimeError("PROVIDER_UNAVAILABLE", `Local AI returned HTTP ${response.status}.`);
    if (stream && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "", content = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let item: { message?: { content?: string }; done?: boolean; error?: string };
          try { item = JSON.parse(line) as typeof item; } catch { throw new ConversationRuntimeError("STREAM_INTERRUPTED", "The local model stream was interrupted."); }
          if (item.error) throw new ConversationRuntimeError("PROVIDER_UNAVAILABLE", item.error);
          const delta = item.message?.content ?? "";
          if (delta) { content += delta; options.onChunk?.({ requestId: input.requestId, content: delta, done: false }); }
        }
      }
      const final = stripThinking(content);
      options.onChunk?.({ requestId: input.requestId, content: "", done: true });
      if (!final) throw new ConversationRuntimeError("PROVIDER_UNAVAILABLE", "The local model returned an empty response.");
      return { requestId: input.requestId, provider: "ollama", model, content: final, streamed: true, interrupted: false };
    }
    const data = await response.json() as { message?: { content?: string }; error?: string };
    const content = stripThinking(data.message?.content ?? "");
    if (!content) throw new ConversationRuntimeError("PROVIDER_UNAVAILABLE", data.error || "The local model returned an empty response.");
    return { requestId: input.requestId, provider: "ollama", model, content, streamed: false, interrupted: false };
  } catch (error) {
    if (signal.aborted && options.signal?.aborted) throw new ConversationRuntimeError("CANCELLED", "The response was stopped.");
    throw error;
  } finally { controller.abort(); }
}

export async function runConversation(input: ConversationRequest, options: { fetchImpl?: FetchLike; signal?: AbortSignal; onChunk?: (chunk: ConversationChunk) => void; timeoutMs?: number; providerRouter?: ConversationProviderRouter } = {}): Promise<ConversationResponse> {
  const model = requireValidRequest(input);
  if (!model) return runAutoRoutedConversation(input, options);
  return runLocalOllamaConversation(input, model, options);
}
