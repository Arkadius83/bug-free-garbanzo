import { detectImageFormat, downloadGeneratedImage } from "./image_download.ts";

function assert(value: unknown) { if (!value) throw new Error("Assertion failed"); }
const webp = new Uint8Array([82,73,70,70,20,0,0,0,87,69,66,80,86,80,56,32]);
Deno.test("Image magic determines extension, not a misleading URL", () => {
  assert(detectImageFormat(webp).extension === ".webp");
  assert(detectImageFormat(new Uint8Array([255,216,255])).extension === ".jpg");
  assert(detectImageFormat(new Uint8Array([137,80,78,71,13,10,26,10])).extension === ".png");
  let rejected = false; try { detectImageFormat(new TextEncoder().encode("<html>login</html>")); } catch { rejected = true; } assert(rejected);
});
Deno.test("Download validates binary content and preserves existing files", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const fakeFetch: typeof fetch = async () => new Response(webp, { headers: { "content-type": "image/webp" } });
    const first = await downloadGeneratedImage("https://example.test/a.jpg", dir, undefined, fakeFetch);
    const second = await downloadGeneratedImage("https://example.test/a.jpg", dir, undefined, fakeFetch);
    assert(first.path.endsWith("image-0001.webp")); assert(second.path.endsWith("image-0002.webp")); assert(first.bytes === webp.length); assert(first.contentType === "image/webp"); assert((await Deno.readFile(first.path)).length === webp.length);
  } finally { await Deno.remove(dir, { recursive: true }); }
});
Deno.test("HTTP and non-image failures do not create an output file", async () => {
  const dir = await Deno.makeTempDir();
  try {
    for (const response of [new Response("secret", { status: 403 }), new Response("<html>login</html>")]) {
      let error = ""; try { await downloadGeneratedImage("https://example.test/a", dir, undefined, async () => response); } catch (caught) { error = String(caught); }
      assert(error.length > 0); assert(!error.includes("secret"));
    }
    const files = []; for await (const file of Deno.readDir(dir)) files.push(file); assert(files.length === 0);
  } finally { await Deno.remove(dir, { recursive: true }); }
});
