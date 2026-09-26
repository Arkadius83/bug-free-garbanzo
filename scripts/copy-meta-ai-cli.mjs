import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "..", "meta-ai-cli");
const dst = path.join(__dirname, "..", "dist-electron", "meta-ai-cli");

if (existsSync(src)) {
  if (existsSync(dst)) {
    cpSync(src, dst, { recursive: true });
  } else {
    cpSync(src, dst, { recursive: true });
  }
  console.log("meta-ai-cli copied to dist-electron/");
} else {
  console.log("meta-ai-cli not found at project root, skipping copy");
}
