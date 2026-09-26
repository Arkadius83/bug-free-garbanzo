import { parsePlaywrightCliJsonResult } from "./playwright_cli.ts";
import { planImageOutputs } from "./paths.ts";
import { buildFrontendImageCreateCode, formatFrontendImagePrompt, imageCreateCommand, runFrontendImageBatch } from "../cli.ts";

function equal(actual: unknown, expected: unknown) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
function throws(fn: () => unknown, message: string) { try { fn(); } catch (error) { if (String(error).includes(message)) return; throw error; } throw new Error("Expected failure"); }

Deno.test("Playwright object result and following code section", () => equal(parsePlaywrightCliJsonResult('### Result\n{"ok":true}\n### Ran Playwright code\nignored'), { ok: true }));
Deno.test("Playwright JSON string result is decoded twice", () => equal(parsePlaywrightCliJsonResult(`### Result\r\n${JSON.stringify(JSON.stringify({ ok: true, text: '"quote"\nżółw' }))}\r\n### Ran Playwright code\r\nignored`), { ok: true, text: '"quote"\nżółw' }));
Deno.test("Browser error is surfaced even with an apparent result", () => throws(() => parsePlaywrightCliJsonResult('### Error\nTimeoutError: Send not found\n### Result\n{"ok":true}'), "TimeoutError: Send not found"));
Deno.test("Missing result includes stderr diagnostics", () => throws(() => parsePlaywrightCliJsonResult("", "process crashed"), "process crashed"));
Deno.test("Empty result rejected", () => throws(() => parsePlaywrightCliJsonResult("### Result\n\n### Ran Playwright code\n"), "empty result"));
Deno.test("Invalid JSON does not leak returned payload", () => throws(() => parsePlaywrightCliJsonResult("### Result\nnot-json"), "non-JSON"));
Deno.test("ANSI and CRLF normalized", () => equal(parsePlaywrightCliJsonResult('\x1b[32m### Result\x1b[0m\r\n{"ok":true}'), { ok: true }));

Deno.test("Frontend builder preserves arbitrary prompt text and uses accessible Send name", async () => {
  const prompt = 'a "quoted" sphere\\path\nżółw ` ${notCode} ### Result';
  let received = "", clicked = false, reads = 0;
  const page = {
    waitForSelector: async () => {},
    locator: () => ({ last: () => ({ fill: async (value: string) => { received = value; } }) }),
    getByRole: (role: string, options: { name: RegExp }) => { equal(role, "button"); equal(options.name.test("Senden"), true); return { last: () => ({ click: async () => { clicked = true; } }) }; },
    evaluate: async (fn: () => unknown) => {
      if (fn.toString().includes('querySelectorAll("img")')) return reads++ === 0 ? [] : [{ url: "https://example.fbcdn.net/test.jpg" }, { url: "https://example.fbcdn.net/test2.jpg" }];
      return [];
    },
    waitForTimeout: async () => {},
  };
  const execute = new Function(`return (${buildFrontendImageCreateCode(prompt, 2)})`)();
  const result = await execute(page);
  equal(received, prompt); equal(clicked, true); equal(result.images.length, 2);
});

Deno.test("All supported aspect ratios are represented in the frontend request", () => {
  for (const aspect of ["1:1", "9:16", "16:9"] as const) equal(formatFrontendImagePrompt("red sphere", aspect), `Create an image: red sphere. Aspect ratio: ${aspect}.`);
});
Deno.test("Invalid count and aspect fail before loading credentials", async () => {
  for (const options of [{ count: 0 }, { count: 5 }, { count: 1.5 }, { aspect: "3:2" }]) {
    let failed = false;
    try { await imageCreateCommand({ prompt: "test", imageOut: "unused", ...options }); } catch (error) { failed = /--count|--aspect/.test(String(error)); }
    equal(failed, true);
  }
});
Deno.test("Directory output stays inside requested directory and never overwrites numbered files", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const first = await planImageOutputs(dir, 2);
    equal(first.length, 2); equal(first[0].endsWith("image-0001.jpg"), true);
    await Deno.writeTextFile(first[1], "existing");
    const next = await planImageOutputs(dir, 1); equal(next[0].endsWith("image-0003.jpg"), true);
    const prefix = await planImageOutputs(`${dir}/legacy`, 1); equal(prefix[0].endsWith("legacy-0001.jpg"), true);
  } finally { await Deno.remove(dir, { recursive: true }); }
});

Deno.test("Image batches execute sequentially and return the exact count", async () => {
  let active = 0, peak = 0, calls = 0;
  const result = await runFrontendImageBatch(4, async () => {
    active++; peak = Math.max(peak, active); calls++;
    await Promise.resolve(); active--;
    return { ok: true, images: [{ url: `https://example.test/${calls}.webp` }] };
  });
  equal(peak, 1); equal(calls, 4); equal(result.images?.length, 4);
});
Deno.test("Partial batches and duplicate earlier images fail explicitly", async () => {
  let calls = 0, message = "";
  try { await runFrontendImageBatch(3, async () => { calls++; return calls === 1 ? { ok: true, images: [{ url: "https://example.test/a.webp" }] } : { ok: false, reason: "generation failed" }; }); } catch (error) { message = String(error); }
  equal(calls, 2); equal(message.includes("generation failed"), true);
  try { await runFrontendImageBatch(2, async () => ({ ok: true, images: [{ url: "https://example.test/a.webp" }] })); } catch (error) { message = String(error); }
  equal(message.includes("earlier image"), true);
});
Deno.test("Frontend rejects a generated aspect mismatch", async () => {
  let reads = 0;
  const page = { waitForSelector: async () => {}, locator: () => ({ last: () => ({ fill: async () => {} }) }), getByRole: () => ({ last: () => ({ click: async () => {} }) }), waitForTimeout: async () => {},
    evaluate: async (fn: () => unknown) => fn.toString().includes('querySelectorAll("img")') ? reads++ === 0 ? [] : [{ url: "https://example.fbcdn.net/a.webp", width: 2048, height: 1152 }] : [] };
  const result = await new Function(`return (${buildFrontendImageCreateCode("test", 1, "1:1")})`)()(page);
  equal(result.ok, false); equal(result.reason.includes("aspect ratio"), true);
});
Deno.test("Generation deadline returns a clear error instead of an empty success", async () => {
  const originalNow = Date.now; let clock = 0; Date.now = () => clock;
  try {
    const page = { waitForSelector: async () => {}, locator: () => ({ last: () => ({ fill: async () => {} }) }), getByRole: () => ({ last: () => ({ click: async () => {} }) }), waitForTimeout: async () => { clock += 300001; }, evaluate: async () => [] };
    const result = await new Function(`return (${buildFrontendImageCreateCode("test", 1)})`)()(page);
    equal(result.ok, false); equal(result.reason.includes("Timed out"), true);
  } finally { Date.now = originalNow; }
});
