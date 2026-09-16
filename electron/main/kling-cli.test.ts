import test from "node:test";
import assert from "node:assert/strict";
import { KlingCliClient, klingCliParsing, type KlingCliRunner } from "./kling-cli.js";

function runner(outputs: Array<{ stdout?: string; stderr?: string } | Error>): KlingCliRunner {
  let index = 0;
  return async () => {
    const next = outputs[index++] ?? { stdout: "", stderr: "" };
    if (next instanceof Error) throw next;
    return { stdout: next.stdout ?? "", stderr: next.stderr ?? "" };
  };
}

test("parses generation id from JSON and human-readable output", () => {
  assert.equal(klingCliParsing.extractGenerationId('{"generation_id":"gen_123456"}'), "gen_123456");
  assert.equal(klingCliParsing.extractGenerationId("generation_id: abcdef123456"), "abcdef123456");
});

test("parses result URL from nested JSON", () => {
  assert.equal(
    klingCliParsing.extractResultUrl('{"works":[{"url":"https://cdn.example.test/result.png"}]}'),
    "https://cdn.example.test/result.png"
  );
});

test("status reports installed and authenticated", async () => {
  const client = new KlingCliClient(runner([
    { stdout: "Kling CLI help" },
    { stdout: '{"email":"artist@example.test","models":[]}' }
  ]));
  assert.deepEqual(await client.status(), {
    installed: true,
    authenticated: true,
    accountLabel: "artist@example.test",
    error: null
  });
});

test("status reports unauthenticated CLI without treating it as missing", async () => {
  const client = new KlingCliClient(runner([
    { stdout: "Kling CLI help" },
    { stdout: "Please login first" }
  ]));
  const status = await client.status();
  assert.equal(status.installed, true);
  assert.equal(status.authenticated, false);
  assert.match(status.error ?? "", /kling login/i);
});

test("createTask uses official CLI command and returns generation id", async () => {
  const calls: string[][] = [];
  const fake: KlingCliRunner = async (args) => {
    calls.push(args);
    return { stdout: '{"generation_id":"gen_987654"}', stderr: "" };
  };
  const client = new KlingCliClient(fake);
  const result = await client.createTask("image", "psytrance cover", "1:1");
  assert.equal(result.providerTaskId, "gen_987654");
  assert.equal(calls[0]?.[0], "text_to_image");
  assert.match(calls[0]?.[1] ?? "", /Output aspect ratio: 1:1/);
});

test("queryTask returns null while no downloadable URL exists", async () => {
  const client = new KlingCliClient(runner([{ stdout: '{"status":"processing"}' }]));
  assert.equal(await client.queryTask("gen_123456"), null);
});

test("queryTask returns final media URL", async () => {
  const client = new KlingCliClient(runner([{ stdout: '{"status":"completed","works":[{"url":"https://cdn.example.test/final.mp4"}]}' }]));
  const result = await client.queryTask("gen_123456");
  assert.equal(result?.remoteUrl, "https://cdn.example.test/final.mp4");
});
