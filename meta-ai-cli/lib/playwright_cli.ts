const DEFAULT_BROWSER = "chrome";
const PLAYWRIGHT_CLI_INSTALL_COMMAND = "npm install -g @playwright/cli@latest";
const PLAYWRIGHT_CLI_BROWSER_INSTALL_COMMAND =
  `playwright-cli install-browser --browser=${DEFAULT_BROWSER}`;

export type PlaywrightCliDependencyChecks = {
  playwrightCliAvailable: boolean;
  playwrightCliBrowserReady: boolean;
  executable: string | null;
  installCommands: string[];
  message: string;
};

type RunPlaywrightCliOptions = {
  allowFailure?: boolean;
  timeoutMs?: number;
};

type PlaywrightCliOpenOptions = {
  url?: string;
  browser?: string;
  headed?: boolean;
  persistent?: boolean;
};

type PlaywrightCliInvocation = {
  command: string;
  argsPrefix: string[];
  display: string;
};

export function generatePlaywrightCliSessionName(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function checkPlaywrightCliDependencies(): Promise<
  PlaywrightCliDependencyChecks
> {
  const executable = resolvePlaywrightCliInvocation().display;

  try {
    await runPlaywrightCli(["--version"]);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      playwrightCliAvailable: false,
      playwrightCliBrowserReady: false,
      executable: null,
      installCommands: [
        PLAYWRIGHT_CLI_INSTALL_COMMAND,
        PLAYWRIGHT_CLI_BROWSER_INSTALL_COMMAND,
      ],
      message: [
        "playwright-cli is not available on PATH.",
        `Install it with \`${PLAYWRIGHT_CLI_INSTALL_COMMAND}\`, then install a browser with \`${PLAYWRIGHT_CLI_BROWSER_INSTALL_COMMAND}\`.`,
        detail,
      ].join(" "),
    };
  }

  const sessionName = generatePlaywrightCliSessionName("meta-ai-check");
  try {
    await openPlaywrightCliSession(sessionName, { url: "about:blank" });
    return {
      playwrightCliAvailable: true,
      playwrightCliBrowserReady: true,
      executable,
      installCommands: [],
      message: `playwright-cli is available via ${executable}.`,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      playwrightCliAvailable: true,
      playwrightCliBrowserReady: false,
      executable,
      installCommands: [PLAYWRIGHT_CLI_BROWSER_INSTALL_COMMAND],
      message: [
        "playwright-cli is installed but could not launch its configured browser.",
        `Run \`${PLAYWRIGHT_CLI_BROWSER_INSTALL_COMMAND}\` and then retry.`,
        detail,
      ].join(" "),
    };
  } finally {
    await closePlaywrightCliSession(sessionName).catch(() => undefined);
  }
}

export async function openPlaywrightCliSession(
  sessionName: string,
  options: PlaywrightCliOpenOptions = {},
): Promise<void> {
  const args = [withSessionArg(sessionName), "open"];
  if (options.url) {
    args.push(options.url);
  }
  args.push(`--browser=${options.browser ?? DEFAULT_BROWSER}`);
  if (options.headed) {
    args.push("--headed");
  }
  if (options.persistent) {
    args.push("--persistent");
  }
  await runPlaywrightCli(args);
}

export async function closePlaywrightCliSession(
  sessionName: string,
): Promise<void> {
  await runPlaywrightCli([withSessionArg(sessionName), "close"], {
    allowFailure: true,
  });
}

export async function loadPlaywrightCliState(
  sessionName: string,
  sessionPath: string,
): Promise<void> {
  await runPlaywrightCli([
    withSessionArg(sessionName),
    "state-load",
    sessionPath,
  ]);
}

export async function gotoPlaywrightCliSession(
  sessionName: string,
  url: string,
): Promise<void> {
  await runPlaywrightCli([withSessionArg(sessionName), "goto", url]);
}

export async function savePlaywrightCliState(
  sessionName: string,
  sessionPath: string,
): Promise<void> {
  await runPlaywrightCli([
    withSessionArg(sessionName),
    "state-save",
    sessionPath,
  ]);
}

export async function runPlaywrightCliCodeJson<T>(
  sessionName: string,
  code: string,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const path = await Deno.makeTempFile({ prefix: "meta-ai-playwright-", suffix: ".js" });
  try {
    await Deno.writeTextFile(path, code);
    const result = await runPlaywrightCli([
      withSessionArg(sessionName), "run-code", `--filename=${path}`,
    ], { timeoutMs: options.timeoutMs ?? 17 * 60 * 1000 });
    return parsePlaywrightCliJsonResult<T>(result.stdout, result.stderr);
  } finally {
    await Deno.remove(path).catch(() => undefined);
  }
}

function withSessionArg(sessionName: string): string {
  return `-s=${sessionName}`;
}

function resolvePlaywrightCliInvocation(): PlaywrightCliInvocation {
  if (Deno.build.os !== "windows") {
    return {
      command: "playwright-cli",
      argsPrefix: [],
      display: "playwright-cli",
    };
  }

  for (const pathEntry of getPathEntries()) {
    const scriptPath =
      `${pathEntry}\\node_modules\\@playwright\\cli\\playwright-cli.js`;
    if (!isFile(scriptPath)) {
      continue;
    }

    const localNode = `${pathEntry}\\node.exe`;
    const nodeCommand = isFile(localNode) ? localNode : "node";
    return {
      command: nodeCommand,
      argsPrefix: [scriptPath],
      display: `${nodeCommand} ${scriptPath}`,
    };
  }

  return {
    command: "node",
    argsPrefix: ["playwright-cli"],
    display: "node playwright-cli",
  };
}

async function runPlaywrightCli(
  args: string[],
  options: RunPlaywrightCliOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  const invocation = resolvePlaywrightCliInvocation();
  const command = new Deno.Command(invocation.command, {
    args: [...invocation.argsPrefix, ...args],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  });

  let output: Deno.CommandOutput;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    const child = command.spawn();
    timer = setTimeout(() => { timedOut = true; try { child.kill("SIGTERM"); } catch { /* Process already exited. */ } }, options.timeoutMs ?? 60_000);
    output = await child.output();
    if (timedOut) throw new Error("playwright-cli process timed out.");
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(
        `Could not execute ${invocation.display}. Is playwright-cli installed and on PATH?`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const stdout = new TextDecoder().decode(output.stdout);
  const stderr = new TextDecoder().decode(output.stderr);
  if (!output.success && !options.allowFailure) {
    const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join(" ");
    throw new Error(
      `${invocation.display} ${
        args.join(" ")
      } failed with code ${output.code}.${detail ? ` ${detail}` : ""}`,
    );
  }

  return { stdout, stderr };
}

function getPathEntries(): string[] {
  const pathValue = Deno.env.get("PATH") ?? Deno.env.get("Path") ?? "";
  return pathValue.split(";").filter((entry) => entry.length > 0);
}

function isFile(path: string): boolean {
  try {
    return Deno.statSync(path).isFile;
  } catch {
    return false;
  }
}

export function parsePlaywrightCliJsonResult<T>(stdout: string, stderr = ""): T {
  const clean = stdout.replace(/\x1b\[[0-9;]*m/g, "").replace(/\r\n/g, "\n");
  const error = clean.match(/^### Error[^\n]*\n([\s\S]*?)(?=^### |$(?![\s\S]))/m);
  if (error) throw new Error(`Playwright browser execution failed: ${error[1].trim().slice(0, 2000)}`);
  const match = clean.match(/^### Result\s*\n([\s\S]*?)(?=^### |$(?![\s\S]))/m);
  if (!match) throw new Error(`playwright-cli did not return a result block.${stderr.trim() ? " " + stderr.trim().slice(0, 1000) : ""}`);
  if (!match[1].trim()) throw new Error("playwright-cli returned an empty result block.");
  try {
    const value: unknown = JSON.parse(match[1].trim());
    // run-code can print a returned object or a JSON.stringify result.
    return (typeof value === "string" ? JSON.parse(value) : value) as T;
  } catch {
    throw new Error("playwright-cli returned a non-JSON result block.");
  }
}
