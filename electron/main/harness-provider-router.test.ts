import assert from "node:assert/strict";
import test from "node:test";
import { localQwenFallbackSource } from "./harness-provider-router.js";

test("AI Studio local Qwen fallback override disables thinking", () => {
  const source = localQwenFallbackSource();
  assert.match(source, /think:\s*false/);
});

test("AI Studio local Qwen fallback override sets explicit output budget", () => {
  const source = localQwenFallbackSource();
  assert.match(source, /num_predict:\s*input\.localQwenNumPredict/);
  assert.match(source, /num_ctx:\s*8192/);
});

test("AI Studio local Qwen fallback override keeps deterministic generation settings", () => {
  const source = localQwenFallbackSource();
  assert.match(source, /temperature:\s*0/);
  assert.match(source, /stream:\s*false/);
});

test("AI Studio local Qwen fallback reports reasoning-only length failures clearly", () => {
  const source = localQwenFallbackSource();
  assert.match(source, /Qwen returned no final response/);
  assert.match(source, /data\.done_reason === "length"/);
});
