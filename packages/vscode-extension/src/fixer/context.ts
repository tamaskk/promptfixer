import * as vscode from "vscode";

const MAX_FILE_CHARS = 20_000;
const MAX_TOTAL_CHARS = 120_000;
const EXCLUDE_GLOB = "{**/node_modules/**,**/.git/**,**/dist/**,**/.next/**,**/build/**}";

export interface ContextFile {
  path: string;
  content: string;
  truncated: boolean;
}

export interface ProjectContext {
  root: string;
  files: ContextFile[];
  activeFile?: { path: string; language: string; selection?: string };
}

/** Files Claude Code reads for project guidance, in priority order. */
const ROOT_FILES = ["CLAUDE.md", "CLAUDE.local.md", ".claude/CLAUDE.md", "AGENTS.md"];
const CLAUDE_DIR_GLOBS = [
  ".claude/commands/**/*.md",
  ".claude/agents/**/*.md",
  ".claude/skills/**/SKILL.md",
  ".claude/rules/**/*.md",
  ".claude/settings.json",
];

async function readText(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
  } catch {
    return undefined;
  }
}

/** Keep only server names and commands from .mcp.json so env secrets never leave the machine. */
function summarizeMcpConfig(raw: string): string {
  try {
    const config = JSON.parse(raw) as { mcpServers?: Record<string, { command?: string; url?: string; type?: string }> };
    const servers = Object.entries(config.mcpServers ?? {}).map(
      ([name, server]) => `- ${name}: ${server.url ?? server.command ?? server.type ?? "configured"}`,
    );
    return servers.length > 0 ? `MCP servers configured for this project:\n${servers.join("\n")}` : "";
  } catch {
    return "";
  }
}

/** Collect CLAUDE.md, AGENTS.md, .claude/ and related files from the workspace. */
export async function collectProjectContext(): Promise<ProjectContext | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;

  const seen = new Set<string>();
  const files: ContextFile[] = [];
  let total = 0;

  const add = (uri: vscode.Uri, content: string) => {
    const path = vscode.workspace.asRelativePath(uri, false);
    if (seen.has(path) || !content.trim() || total >= MAX_TOTAL_CHARS) return;
    seen.add(path);
    const budget = Math.min(MAX_FILE_CHARS, MAX_TOTAL_CHARS - total);
    const truncated = content.length > budget;
    const text = truncated ? content.slice(0, budget) : content;
    total += text.length;
    files.push({ path, content: text, truncated });
  };

  for (const name of ROOT_FILES) {
    const uri = vscode.Uri.joinPath(folder.uri, name);
    const content = await readText(uri);
    if (content !== undefined) add(uri, content);
  }

  // Nested CLAUDE.md files apply to their subdirectories
  const nested = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/CLAUDE.md"), EXCLUDE_GLOB, 30);
  for (const uri of nested.sort((a, b) => a.path.length - b.path.length)) {
    const content = await readText(uri);
    if (content !== undefined) add(uri, content);
  }

  for (const glob of CLAUDE_DIR_GLOBS) {
    const uris = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, glob), EXCLUDE_GLOB, 50);
    for (const uri of uris.sort((a, b) => a.path.localeCompare(b.path))) {
      const content = await readText(uri);
      if (content !== undefined) add(uri, content);
    }
  }

  const mcpUri = vscode.Uri.joinPath(folder.uri, ".mcp.json");
  const mcpRaw = await readText(mcpUri);
  if (mcpRaw) add(mcpUri, summarizeMcpConfig(mcpRaw));

  const editor = vscode.window.activeTextEditor;
  let activeFile: ProjectContext["activeFile"];
  if (editor && editor.document.uri.scheme === "file") {
    const selection = editor.document.getText(editor.selection);
    activeFile = {
      path: vscode.workspace.asRelativePath(editor.document.uri, false),
      language: editor.document.languageId,
      selection: selection.trim() ? selection.slice(0, MAX_FILE_CHARS) : undefined,
    };
  }

  return { root: folder.uri.fsPath, files, activeFile };
}
