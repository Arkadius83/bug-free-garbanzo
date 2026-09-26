import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MetaAiClient } from "./meta-ai.js";

const denoAvailable = spawnSync("deno", ["--version"], { timeout: 15_000 }).status === 0;
const skip = denoAvailable ? false : "deno is not available on PATH";

const FAKE_CLI = `
const args = Deno.args;
const promptIndex = args.indexOf("--prompt");
const prompt = promptIndex >= 0 ? (args[promptIndex + 1] ?? "") : "";
const outIndex = args.indexOf("--image-out");
const outputBase = outIndex >= 0 ? (args[outIndex + 1] ?? "") : "";

if (prompt.includes("FAILDOWNLOAD")) {
  console.error(JSON.stringify({ ok: false, message: "Image download failed: HTTP 403." }));
  Deno.exit(1);
}

const images = [];
if (!prompt.includes("EMPTY")) {
  await Deno.mkdir(outputBase, { recursive: true });
  const filePath = outputBase + "/image-0001.png";
  await Deno.writeFile(filePath, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  images.push({ index: 1, id: "img-1", url: "https://s.meta.ai/img1.png", thumbnail: null, downloadableFileName: null, path: filePath, bytes: 8, contentType: "image/png" });
}

console.log(JSON.stringify({
  ok: true,
  command: "image create",
  sessionPath: "test",
  prompt,
  aspect: "9:16",
  count: 1,
  conversationId: "test-conv",
  animated: false,
  extendCount: 0,
  images,
  animation: null,
  message: "Saved " + images.length + " image(s).",
  echoArgs: args,
  scriptUrl: import.meta.url,
}));
`;

type Harness = {
  root: string;
  client: MetaAiClient;
  sessionPath: string;
  outputDir: string;
};

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(os.tmpdir(), "meta ai spaces "));
  const cliDir = path.join(root, "meta ai cli with spaces");
  const userData = path.join(root, "user data with spaces");
  await mkdir(cliDir, { recursive: true });
  await mkdir(path.join(userData, "integrations"), { recursive: true });
  await writeFile(path.join(cliDir, "cli.ts"), FAKE_CLI);
  const sessionPath = path.join(userData, "integrations", "meta-ai-session.json");
  await writeFile(sessionPath, JSON.stringify({ cookies: [{ domain: ".meta.ai", name: "sess", value: "abc123" }] }));
  return {
    root,
    client: new MetaAiClient(userData, cliDir),
    sessionPath,
    outputDir: path.join(cliDir, "output"),
  };
}

test("Meta AI image generation saves a real file and keeps spaced Windows arguments intact", { skip }, async () => {
  const harness = await createHarness();
  try {
    const result = await harness.client.generateImage("a fox in snowfall", "9:16", 1);
    assert.equal(result.ok, true);
    assert.equal(result.images?.length, 1);
    const savedPath = result.images![0]!.path;
    assert.ok(existsSync(savedPath), `expected saved image at ${savedPath}`);

    const echoed = result as unknown as { echoArgs?: string[]; scriptUrl?: string };
    assert.ok(Array.isArray(echoed.echoArgs), "fake CLI should echo its arguments");
    const args = echoed.echoArgs!;
    assert.ok(args.includes("a fox in snowfall"), "prompt must arrive as a single argument");
    assert.ok(!args.includes("fox"), "prompt must not be split at spaces");
    assert.ok(args.includes(harness.sessionPath), "session path with spaces must stay a single argument");
    assert.ok(args.includes(harness.outputDir), "image-out path with spaces must stay a single argument");
    assert.ok(!args.some((arg) => arg.startsWith("file://")), "no manually constructed file:// URL arguments");

    assert.ok(typeof echoed.scriptUrl === "string", "fake CLI should report its script URL");
    assert.ok(echoed.scriptUrl!.endsWith("/cli.ts"), `CLI script must resolve to the cli.ts file, got: ${echoed.scriptUrl}`);
    assert.notEqual(echoed.scriptUrl, "file:///E:/", "must never reproduce the ERR_UNSUPPORTED_DIR_IMPORT file:///E:/ scenario");
  } finally {
    await rm(harness.root, { recursive: true, force: true });
  }
});

test("zero-image Meta AI results are rejected with the output location", { skip }, async () => {
  const harness = await createHarness();
  try {
    await assert.rejects(harness.client.generateImage("EMPTY test image", "9:16", 1), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /without saving any image/);
      assert.match(error.message, /Output directory:/);
      assert.ok(error.message.includes(harness.outputDir), "error must include the actual output directory");
      return true;
    });
  } finally {
    await rm(harness.root, { recursive: true, force: true });
  }
});

test("failed downloads surface the CLI stderr and the output location", { skip }, async () => {
  const harness = await createHarness();
  try {
    await assert.rejects(harness.client.generateImage("FAILDOWNLOAD test image", "9:16", 1), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Image download failed: HTTP 403/);
      assert.match(error.message, /Output directory:/);
      assert.ok(error.message.includes(harness.outputDir), "error must include the actual output directory");
      return true;
    });
  } finally {
    await rm(harness.root, { recursive: true, force: true });
  }
});
