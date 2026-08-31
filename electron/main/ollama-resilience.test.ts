import assert from "node:assert/strict";
import test from "node:test";
import { discoverOllamaModels, generateCampaignDraft } from "./ollama.js";

function installFetch(sequence: Array<Response | Error>) {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    const value = sequence[Math.min(calls, sequence.length - 1)]!;
    calls += 1;
    if (value instanceof Error) throw value;
    return value;
  }) as typeof fetch;
  return { calls: () => calls, restore: () => { globalThis.fetch = original; } };
}

test("Ollama model discovery retries a transient 503", async () => {
  const mocked = installFetch([
    new Response("busy", { status: 503 }),
    new Response(JSON.stringify({ models: [{ name: "qwen3:8b", size: 123, modified_at: "now" }] }), { status: 200, headers: { "Content-Type": "application/json" } })
  ]);
  try {
    const models = await discoverOllamaModels();
    assert.equal(models[0]?.name, "qwen3:8b");
    assert.equal(mocked.calls(), 2);
  } finally { mocked.restore(); }
});

test("Ollama model discovery reports a stable offline error", async () => {
  const mocked = installFetch([new TypeError("connection refused"), new TypeError("connection refused")]);
  try {
    await assert.rejects(discoverOllamaModels(), /Ollama is offline or unreachable/);
    assert.equal(mocked.calls(), 2);
  } finally { mocked.restore(); }
});

test("Ollama generation does not auto-retry a POST on 429", async () => {
  const mocked = installFetch([new Response("rate limited", { status: 429 }), new Response("unexpected", { status: 200 })]);
  try {
    await assert.rejects(generateCampaignDraft({
      model: "qwen3:8b",
      artistId: "the-arkadiusz",
      artistName: "Test Artist",
      artistVoice: "concise",
      title: "Test Track",
      primaryGenre: "Psytrance",
      story: "",
      releaseDate: null,
      language: "en",
      channel: "Instagram"
    }), /rate limit/);
    assert.equal(mocked.calls(), 1);
  } finally { mocked.restore(); }
});
