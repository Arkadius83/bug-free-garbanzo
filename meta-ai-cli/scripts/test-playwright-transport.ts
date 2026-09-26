import { closePlaywrightCliSession, generatePlaywrightCliSessionName, openPlaywrightCliSession, runPlaywrightCliCodeJson } from "../lib/playwright_cli.ts";

const session = generatePlaywrightCliSessionName("meta-transport-test");
const payload = '"quote" \\ path\nżółw ` ${literal} ### Result '.repeat(3000);
try {
  await openPlaywrightCliSession(session, { url: "about:blank" });
  const result = await runPlaywrightCliCodeJson<{ length: number; same: boolean }>(session,
    `async (page) => { const input = ${JSON.stringify(payload)}; return JSON.stringify({ length: input.length, same: input.endsWith(${JSON.stringify(payload.slice(-40))}) }); }`,
    { timeoutMs: 30_000 });
  if (result.length !== payload.length || !result.same) throw new Error("Large code file transport changed the input.");
  let surfaced = false;
  try { await runPlaywrightCliCodeJson(session, 'async (page) => { throw new Error("controlled browser failure"); }'); }
  catch (error) { surfaced = String(error).includes("controlled browser failure"); }
  if (!surfaced) throw new Error("Browser error section was not surfaced.");
  console.log(JSON.stringify({ ok: true, payloadCharacters: payload.length, errorSectionHandled: true }));
} finally { await closePlaywrightCliSession(session); }
