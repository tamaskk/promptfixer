import * as vscode from "vscode";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Engine = "gpt-4o" | "claude-cli";

export const OPENAI_KEY_SECRET = "promptsChat.openaiApiKey";

function fixerConfig() {
  return vscode.workspace.getConfiguration("promptsChat.fixer");
}

export async function generateWithOpenAI(
  secrets: vscode.SecretStorage,
  system: string,
  user: string,
  signal: AbortSignal,
): Promise<string> {
  const apiKey = (await secrets.get(OPENAI_KEY_SECRET)) || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('No OpenAI API key. Run "prompts.chat: Set OpenAI API Key" first.');
  }

  const baseUrl = (fixerConfig().get<string>("openaiBaseUrl") || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = fixerConfig().get<string>("openaiModel") || "gpt-4o";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { error?: { message?: string } } | undefined;
    throw new Error(`OpenAI error (HTTP ${response.status}): ${body?.error?.message ?? response.statusText}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI returned an empty response.");
  return text;
}

/**
 * Resolve the Claude CLI binary. Apps launched from the macOS Dock do not
 * inherit the shell PATH, so common install locations are checked too.
 */
export function resolveClaudePath(): string {
  const configured = fixerConfig().get<string>("claudePath")?.trim();
  if (configured && configured !== "claude") return configured;

  const candidates = [
    join(homedir(), ".local", "bin", "claude"),
    join(homedir(), ".claude", "local", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? "claude";
}

export function generateWithClaudeCli(system: string, user: string, cwd: string | undefined, signal: AbortSignal): Promise<string> {
  const claudePath = resolveClaudePath();
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

  return new Promise((resolve, reject) => {
    const child = spawn(claudePath, args, { cwd, env: process.env, signal });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new Error(`Claude CLI not found at "${claudePath}". Set "promptsChat.fixer.claudePath" in Settings.`));
      } else if (error.name === "AbortError") {
        reject(new Error("Cancelled."));
      } else {
        reject(error);
      }
    });
    child.on("close", (code) => {
      const text = stdout.trim();
      if (code === 0 && text) resolve(text);
      else reject(new Error(`Claude CLI exited with code ${code}: ${(stderr || stdout).trim().slice(0, 500) || "no output"}`));
    });

    child.stdin.end(user);
  });
}
