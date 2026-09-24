import * as vscode from "vscode";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type Engine = "codex-cli" | "claude-cli";

function fixerConfig() {
  return vscode.workspace.getConfiguration("promptsChat.fixer");
}

/**
 * Resolve a CLI binary. Apps launched from the macOS Dock do not inherit the
 * shell PATH, so common install locations are checked too.
 */
function resolveBinary(configKey: string, command: string, extraCandidates: string[]): string {
  const configured = fixerConfig().get<string>(configKey)?.trim();
  if (configured && configured !== command) return configured;

  const candidates = [
    join(homedir(), ".local", "bin", command),
    ...extraCandidates,
    "/opt/homebrew/bin/" + command,
    "/usr/local/bin/" + command,
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? command;
}

export function resolveClaudePath(): string {
  return resolveBinary("claudePath", "claude", [join(homedir(), ".claude", "local", "claude")]);
}

export function resolveCodexPath(): string {
  const nvmBin = join(homedir(), ".nvm", "versions", "node");
  const nvmCandidates = existsSync(nvmBin)
    ? readdirSync(nvmBin)
        .map((version) => join(nvmBin, version, "bin", "codex"))
        .filter((candidate) => existsSync(candidate))
        .sort()
        .reverse()
    : [];
  return resolveBinary("codexPath", "codex", nvmCandidates);
}

interface SpawnOptions {
  binary: string;
  args: string[];
  stdin: string;
  cwd: string | undefined;
  signal: AbortSignal;
  notFoundHint: string;
  /** Read the reply from this file instead of stdout (used by Codex). */
  outputFile?: string;
}

function run({ binary, args, stdin, cwd, signal, notFoundHint, outputFile }: SpawnOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    // Node-based CLIs have a `#!/usr/bin/env node` shebang, so their own directory must be on PATH
    const env = { ...process.env, PATH: `${dirname(binary)}:${process.env.PATH ?? ""}` };
    const child = spawn(binary, args, { cwd, env, signal });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") reject(new Error(notFoundHint));
      else if (error.name === "AbortError") reject(new Error("Cancelled."));
      else reject(error);
    });
    child.on("close", (code) => {
      let text = stdout.trim();
      if (outputFile) {
        try {
          text = readFileSync(outputFile, "utf8").trim();
        } catch {
          // Fall back to stdout below
        }
        rmSync(outputFile, { force: true });
      }
      if (code === 0 && text) return resolve(text);
      // CLIs echo the prompt before failing, so the real error is at the end
      const details = (stderr || stdout).trim().slice(-500) || "no output";
      reject(new Error(`${binary} exited with code ${code}: ${details}`));
    });

    child.stdin.end(stdin);
  });
}

/** Local Codex CLI (`codex exec`), read-only sandbox, using the existing ChatGPT login. */
export function generateWithCodexCli(
  system: string,
  user: string,
  cwd: string | undefined,
  signal: AbortSignal,
): Promise<string> {
  const binary = resolveCodexPath();
  const outputFile = join(tmpdir(), `prompts-chat-fixer-${Date.now()}.txt`);
  const args = [
    "exec",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--color",
    "never",
    "--output-last-message",
    outputFile,
  ];
  if (cwd) args.push("--cd", cwd);
  const model = fixerConfig().get<string>("codexModel")?.trim();
  if (model) args.push("--model", model);
  args.push("-");

  return run({
    binary,
    args,
    // codex exec has no separate system prompt, so both parts go in as one message
    stdin: `${system}\n\n---\n\n${user}`,
    cwd,
    signal,
    notFoundHint: `Codex CLI not found at "${binary}". Install it or set "promptsChat.fixer.codexPath" in Settings.`,
    outputFile,
  });
}

/** Claude CLI (`claude -p`) with editing tools disabled. */
export function generateWithClaudeCli(
  system: string,
  user: string,
  cwd: string | undefined,
  signal: AbortSignal,
): Promise<string> {
  const binary = resolveClaudePath();
  const args = [
    "-p",
    "--output-format",
    "text",
    "--append-system-prompt",
    system,
    // Prompt generation must never change the project
    "--disallowedTools",
    "Edit",
    "Write",
    "NotebookEdit",
    "Bash",
  ];
  const model = fixerConfig().get<string>("claudeModel")?.trim();
  if (model) args.push("--model", model);

  return run({
    binary,
    args,
    stdin: user,
    cwd,
    signal,
    notFoundHint: `Claude CLI not found at "${binary}". Install it or set "promptsChat.fixer.claudePath" in Settings.`,
  });
}
