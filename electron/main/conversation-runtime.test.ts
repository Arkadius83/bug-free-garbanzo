import assert from "node:assert/strict";
import test from "node:test";
import { buildConversationMessages, humanizeConversationError, normalizeConversationHistory, runConversation } from "./conversation-runtime.js";
import type { ConversationProviderRouter } from "./conversation-runtime.js";
import type { ConversationRequest } from "../shared/contracts.js";

function request(overrides: Partial<ConversationRequest> = {}): ConversationRequest {
  return {
    requestId: "request-1",
    model: "qwen3.5:9b",
    message: "Plan a teaser post.",
    stream: true,
    history: [],
    workspace: { projectName: "AI Studio Manager", artistId: "the-arkadiusz", artistName: "The Arkadiusz", releaseId: "rel-1", releaseTitle: "Different Perspective", primaryGenre: "Psytrance", releaseStatus: "draft" },
    ...overrides
  };
}

function jsonResponse(value: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(value), { status, statusText: ok ? "OK" : "Error", headers: { "Content-Type": "application/json" } });
}

function streamResponse(lines: unknown[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({ start(controller) { for (const line of lines) controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`)); controller.close(); } }), { status: 200 });
}

test("streams conversation chunks and returns final content", async () => {
  const chunks: string[] = [];
  const result = await runConversation(request(), { fetchImpl: async () => streamResponse([{ message: { content: "Hello " } }, { message: { content: "artist" }, done: true }]), onChunk: (chunk) => chunks.push(chunk.content) });
  assert.equal(result.streamed, true);
  assert.equal(result.content, "Hello artist");
  assert.deepEqual(chunks, ["Hello ", "artist", ""]);
});

test("falls back to non-streaming response when body is unavailable", async () => {
  const result = await runConversation(request({ stream: false }), { fetchImpl: async () => jsonResponse({ message: { content: "Whole answer" } }) });
  assert.equal(result.streamed, false);
  assert.equal(result.content, "Whole answer");
});

test("bounded history keeps the newest valid messages", () => {
  const history = Array.from({ length: 20 }, (_, index) => ({ id: `m${index}`, role: index % 2 ? "assistant" : "user", content: `message ${index}`, createdAt: "now" }));
  const normalized = normalizeConversationHistory(history);
  assert.equal(normalized.length, 12);
  assert.equal(normalized[0]?.content, "message 8");
  assert.equal(normalized.at(-1)?.content, "message 19");
});

test("workspace context is lightweight and included in provider messages", () => {
  const messages = buildConversationMessages(request());
  assert.equal(messages[0]?.role, "system");
  assert.match(messages[0]?.content ?? "", /Active release: Different Perspective/);
  assert.doesNotMatch(messages[0]?.content ?? "", /read the entire project/i);
});

test("provider HTTP errors become human-readable failures", async () => {
  await assert.rejects(() => runConversation(request(), { fetchImpl: async () => new Response("no", { status: 503 }) }), /Local AI returned HTTP 503/);
});

test("offline errors are humanized", () => {
  assert.equal(humanizeConversationError(new Error("fetch failed ECONNREFUSED")), "Local AI is offline. Start Ollama or switch to Auto routing.");
});

test("cancellation aborts active conversation", async () => {
  const controller = new AbortController();
  const promise = runConversation(request(), { signal: controller.signal, fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => { init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))); }) });
  controller.abort();
  await assert.rejects(() => promise, /response was stopped/i);
});

test("invalid request rejects before provider call", async () => {
  await assert.rejects(() => runConversation(request({ model: 42 as unknown as string })), /Choose Auto or an available local AI model/);
});

test("interrupted stream is reported clearly", async () => {
  const encoder = new TextEncoder();
  const bad = new Response(new ReadableStream({ start(controller) { controller.enqueue(encoder.encode("{bad\n")); controller.close(); } }), { status: 200 });
  await assert.rejects(() => runConversation(request(), { fetchImpl: async () => bad }), /stream was interrupted/i);
});

test("auto routing uses providerRouter when model is null", async () => {
  const router: ConversationProviderRouter = async (prompt) => ({
    ok: true, provider: "opencode-http", model: "opencode-default", output: "Auto routed response", durationMs: 100, attempts: []
  });
  const result = await runConversation(request({ model: null }), { providerRouter: router });
  assert.equal(result.provider, "opencode-http");
  assert.equal(result.model, "opencode-default");
  assert.equal(result.content, "Auto routed response");
  assert.equal(result.streamed, false);
});

test("auto routing strips <think> tags from provider response", async () => {
  const router: ConversationProviderRouter = async () => ({
    ok: true, provider: "opencode-http", model: "test", output: "<think>reasoning</think>Final answer", durationMs: 50, attempts: []
  });
  const result = await runConversation(request({ model: null }), { providerRouter: router });
  assert.equal(result.content, "Final answer");
});

test("auto routing throws when provider fails", async () => {
  const router: ConversationProviderRouter = async () => ({
    ok: false, durationMs: 100, attempts: [{ provider: "opencode-http", model: "test", label: "OpenCode HTTP", ok: false, durationMs: 100, errorType: "UNAVAILABLE", errorMessage: "Provider offline" }], errorMessage: "No provider available"
  });
  await assert.rejects(() => runConversation(request({ model: null }), { providerRouter: router }), /No provider available/);
});

test("manual model override ignores providerRouter", async () => {
  const routerCalled: ConversationProviderRouter = async () => { throw new Error("should not be called"); };
  let fetchCalled = false;
  const result = await runConversation(request({ model: "llama3", stream: false }), {
    providerRouter: routerCalled,
    fetchImpl: async () => { fetchCalled = true; return jsonResponse({ message: { content: "Local response" } }); }
  });
  assert.equal(fetchCalled, true);
  assert.equal(result.provider, "ollama");
  assert.equal(result.model, "llama3");
  assert.equal(result.content, "Local response");
});

test("workspace context is passive background, not a proactive topic", () => {
  const system = buildConversationMessages(request({ message: "hi" }))[0]?.content ?? "";
  assert.match(system, /passive background only/i);
  assert.match(system, /Use it only when the current user request is clearly about/i);
  assert.match(system, /For casual greetings, general questions, translations, or unrelated topics, answer normally without introducing/i);
});

test("passive workspace context is still supplied for relevant requests", () => {
  const system = buildConversationMessages(request({ message: "Plan the release campaign for the active track." }))[0]?.content ?? "";
  assert.match(system, /Active release: Different Perspective/);
  assert.match(system, /Genre: Psytrance/);
  assert.match(system, /Artist: The Arkadiusz/);
});

test("auto routing response carries provider execution trace", async () => {
  const router: ConversationProviderRouter = async () => ({
    ok: true,
    provider: "opencode-http",
    model: "opencode-default",
    output: "Auto routed response",
    durationMs: 100,
    attempts: [],
    trace: {
      startTimestamp: "1970-01-01T00:00:01.000Z",
      endTimestamp: "1970-01-01T00:00:01.100Z",
      durationMs: 100,
      finalStatus: "success",
      fallbackUsed: false,
      diagnostics: [{
        providerId: "provider-runner",
        providerName: "Harness provider runner",
        startTimestamp: "1970-01-01T00:00:01.000Z",
        endTimestamp: "1970-01-01T00:00:01.100Z",
        durationMs: 100,
        finalStatus: "success",
        exitCode: 0,
        exitSignal: null,
        validResultReceived: true,
        fallbackUsed: false
      }]
    }
  });
  const result = await runConversation(request({ model: null }), { providerRouter: router });
  assert.equal(result.trace?.finalStatus, "success");
  assert.equal(result.trace?.diagnostics[0]?.providerName, "Harness provider runner");
  assert.equal(result.trace?.diagnostics[0]?.validResultReceived, true);
});

test("failed Auto route sends diagnostics before preserving rejection semantics", async () => {
  const chunks: unknown[] = [];
  const trace = { startTimestamp: "2026-01-01T00:00:00Z", endTimestamp: "2026-01-01T00:00:01Z", durationMs: 1000, finalStatus: "timeout" as const, fallbackUsed: false, diagnostics: [] };
  await assert.rejects(runConversation(request({ model: null }), {
    onChunk: chunk => chunks.push(chunk),
    providerRouter: async () => ({ ok: false, durationMs: 1000, attempts: [], errorMessage: "Timed out", trace })
  }), /Timed out/);
  assert.deepEqual(chunks, [{ requestId: "request-1", content: "", done: false, trace }]);
});
