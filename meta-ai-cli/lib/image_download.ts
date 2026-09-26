import { planImageOutputs } from "./paths.ts";
import type { DownloadResult } from "./download.ts";

export function detectImageFormat(data: Uint8Array): { extension: string; contentType: string } {
  if (data.length >= 12 && String.fromCharCode(...data.slice(0, 4)) === "RIFF" && String.fromCharCode(...data.slice(8, 12)) === "WEBP") return { extension: ".webp", contentType: "image/webp" };
  if (data.length >= 8 && data.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index])) return { extension: ".png", contentType: "image/png" };
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) return { extension: ".jpg", contentType: "image/jpeg" };
  throw new Error("Meta download did not contain a supported image (JPEG, PNG or WebP).");
}

export async function downloadGeneratedImage(url: string, outputBase: string, headers?: HeadersInit, fetcher: typeof fetch = fetch): Promise<DownloadResult> {
  const response = await fetcher(url, { headers, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status}.`);
  if (!response.body) throw new Error("Image download returned an empty body.");
  const limit = 32 * 1024 * 1024;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) throw new Error("Generated image exceeds the 32 MB download limit.");
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  const format = detectImageFormat(data);
  const [path] = await planImageOutputs(outputBase, 1, format.extension);
  await Deno.writeFile(path, data, { createNew: true });
  return { path, bytes, contentType: format.contentType };
}
