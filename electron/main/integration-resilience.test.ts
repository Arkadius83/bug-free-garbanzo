import assert from "node:assert/strict";
import test from "node:test";
import { integrationHttpError, resilientFetch } from "./integration-resilience.js";

function mockFetch(sequence: Array<Response | Error>) {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    const item = sequence[Math.min(calls, sequence.length - 1)]!;
    calls += 1;
    if (item instanceof Error) throw item;
    return item;
  }) as typeof fetch;
  return { calls: () => calls, restore: () => { globalThis.fetch = original; } };
}

test("retries a 429 response and succeeds", async () => {
  const mocked = mockFetch([new Response("busy", { status: 429 }), new Response("ok", { status: 200 })]);
  try {
    const response = await resilientFetch("https://example.test", {}, { service: "Example", retries: 1, retryDelayMs: 0 });
    assert.equal(response.status, 200);
    assert.equal(mocked.calls(), 2);
  } finally { mocked.restore(); }
});

test("does not retry authentication or permission failures", async () => {
  for (const status of [401, 403]) {
    const mocked = mockFetch([new Response("denied", { status }), new Response("unexpected", { status: 200 })]);
    try {
      const response = await resilientFetch("https://example.test", {}, { service: "Example", retries: 2, retryDelayMs: 0 });
      assert.equal(response.status, status);
      assert.equal(mocked.calls(), 1);
    } finally { mocked.restore(); }
  }
});

test("retries a transient network failure", async () => {
  const mocked = mockFetch([new TypeError("network down"), new Response("ok", { status: 200 })]);
  try {
    const response = await resilientFetch("https://example.test", {}, { service: "Example", retries: 1, retryDelayMs: 0 });
    assert.equal(response.status, 200);
    assert.equal(mocked.calls(), 2);
  } finally { mocked.restore(); }
});

test("returns a stable offline error after retry exhaustion", async () => {
  const mocked = mockFetch([new TypeError("network down"), new TypeError("still down")]);
  try {
    await assert.rejects(
      resilientFetch("https://example.test", {}, { service: "Example", retries: 1, retryDelayMs: 0 }),
      /Example is offline or unreachable/
    );
    assert.equal(mocked.calls(), 2);
  } finally { mocked.restore(); }
});

test("formats 401, 403 and 429 as actionable errors", () => {
  assert.match(integrationHttpError("Spotify", 401).message, /Reconnect/);
  assert.match(integrationHttpError("Meta", 403).message, /permissions/);
  assert.match(integrationHttpError("OpenAI", 429).message, /Retry shortly/);
});
