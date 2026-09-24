import * as vscode from "vscode";
import { collectProjectContext } from "./context";
import { SYSTEM_PROMPT, buildUserMessage } from "./meta-prompt";
import { generateWithClaudeCli, generateWithCodexCli, resolveClaudePath, type Engine } from "./engines";

type IncomingMessage =
  | { type: "generate"; request: string; engine: Engine }
  | { type: "cancel" }
  | { type: "setEngine"; engine: Engine }
  | { type: "copy"; text: string }
  | { type: "runInClaude"; text: string }
  | { type: "insert"; text: string };

const ENGINE_STATE_KEY = "promptsChat.fixer.engine";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Sidebar view: turn a short request into a project-aware prompt with GPT-4o or the Claude CLI. */
export class PromptFixerView implements vscode.WebviewViewProvider {
  static readonly viewId = "promptsChat.fixer";
  private view: vscode.WebviewView | undefined;
  private abort: AbortController | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    const engine = this.context.globalState.get<Engine>(ENGINE_STATE_KEY, "claude-cli");
    view.webview.html = this.render(engine);
    view.webview.onDidReceiveMessage((message: IncomingMessage) => this.handle(message));
  }

  private post(message: Record<string, unknown>): void {
    this.view?.webview.postMessage(message);
  }

  private async handle(message: IncomingMessage): Promise<void> {
    switch (message.type) {
      case "generate":
        return this.generate(message.request, message.engine);
      case "cancel":
        this.abort?.abort();
        return;
      case "setEngine":
        await this.context.globalState.update(ENGINE_STATE_KEY, message.engine);
        return;
      case "copy":
        await vscode.env.clipboard.writeText(message.text);
        vscode.window.setStatusBarMessage("$(check) Prompt copied", 3000);
        return;
      case "insert": {
        const editor = vscode.window.activeTextEditor ?? vscode.window.visibleTextEditors[0];
        if (!editor) {
          vscode.window.showWarningMessage("Open a text editor to insert the prompt.");
          return;
        }
        await editor.edit((edit) => editor.selections.forEach((selection) => edit.replace(selection, message.text)));
        return;
      }
      case "runInClaude": {
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const terminal = vscode.window.createTerminal({ name: "Claude Code", cwd });
        terminal.show();
        terminal.sendText(`${shellQuote(resolveClaudePath())} ${shellQuote(message.text)}`);
        return;
      }
    }
  }

  private async generate(request: string, engine: Engine): Promise<void> {
    if (!request.trim()) return;
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;

    this.post({ type: "status", text: "Reading CLAUDE.md, AGENTS.md and .claude/…" });
    try {
      const context = await collectProjectContext();
      const files = context?.files.map((f) => f.path) ?? [];
      this.post({ type: "sources", files, activeFile: context?.activeFile?.path });

      const user = buildUserMessage(request, context);
      this.post({ type: "status", text: engine === "codex-cli" ? "Generating with Codex CLI…" : "Generating with Claude CLI…" });

      const generate = engine === "codex-cli" ? generateWithCodexCli : generateWithClaudeCli;
      const result = await generate(SYSTEM_PROMPT, user, context?.root, abort.signal);

      this.post({ type: "result", text: result });
    } catch (error) {
      const text = abort.signal.aborted ? "Cancelled." : error instanceof Error ? error.message : String(error);
      this.post({ type: "error", text });
    } finally {
      if (this.abort === abort) this.abort = undefined;
    }
  }

  private render(engine: Engine): string {
    const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
    const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}">
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 8px 12px; }
  textarea { width: 100%; box-sizing: border-box; min-height: 64px; resize: vertical; font: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; padding: 6px; }
  textarea:focus { outline: 1px solid var(--vscode-focusBorder); }
  .engines { display: flex; margin: 8px 0; border: 1px solid var(--vscode-button-secondaryBackground); border-radius: 3px; overflow: hidden; }
  .engines button { flex: 1; border-radius: 0; background: transparent; color: var(--vscode-foreground); }
  .engines button.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button { font: inherit; border: none; padding: 5px 10px; border-radius: 2px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button:disabled { opacity: 0.5; cursor: default; }
  .row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
  .row button.primary { flex: 1; }
  .status { color: var(--vscode-descriptionForeground); margin-top: 8px; font-size: 0.92em; }
  .error { color: var(--vscode-errorForeground); margin-top: 8px; white-space: pre-wrap; }
  .sources { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-top: 6px; }
  .sources code { font-family: var(--vscode-editor-font-family); }
  pre { white-space: pre-wrap; word-wrap: break-word; background: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 3px; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); max-height: 50vh; overflow: auto; margin: 8px 0 0; }
  .hint { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-top: 4px; }
</style>
</head>
<body>
  <textarea id="request" placeholder="e.g. fix it please"></textarea>
  <div class="hint">⌘/Ctrl + Enter to generate. Uses CLAUDE.md, AGENTS.md, .claude/ and the active file.</div>
  <div class="engines" role="radiogroup" aria-label="Engine">
    <button data-engine="codex-cli" role="radio">Codex CLI</button>
    <button data-engine="claude-cli" role="radio">Claude CLI</button>
  </div>
  <div class="row">
    <button id="generate" class="primary">Generate Prompt</button>
    <button id="cancel" class="secondary" hidden>Cancel</button>
  </div>
  <div id="status" class="status" hidden></div>
  <div id="error" class="error" hidden></div>
  <div id="sources" class="sources" hidden></div>
  <div id="output" hidden>
    <pre id="result"></pre>
    <div class="row">
      <button id="copy">Copy</button>
      <button id="run" class="secondary">Run in Claude Code</button>
      <button id="insert" class="secondary">Insert</button>
    </div>
  </div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const state = Object.assign({ engine: ${JSON.stringify(engine)}, request: "", result: "" }, vscode.getState() || {});
  const $ = (id) => document.getElementById(id);
  const request = $("request");

  function save() { vscode.setState(state); }
  function setEngine(engine) {
    state.engine = engine;
    document.querySelectorAll("[data-engine]").forEach((b) => {
      const active = b.dataset.engine === engine;
      b.classList.toggle("active", active);
      b.setAttribute("aria-checked", String(active));
    });
    save();
  }
  function setBusy(busy) {
    $("generate").disabled = busy;
    $("cancel").hidden = !busy;
    $("status").hidden = !busy;
  }
  function showResult(text) {
    state.result = text;
    $("result").textContent = text;
    $("output").hidden = !text;
    save();
  }

  request.value = state.request;
  setEngine(state.engine);
  showResult(state.result);

  document.querySelectorAll("[data-engine]").forEach((b) => b.addEventListener("click", () => {
    setEngine(b.dataset.engine);
    vscode.postMessage({ type: "setEngine", engine: state.engine });
  }));
  request.addEventListener("input", () => { state.request = request.value; save(); });
  request.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); }
  });

  function generate() {
    if (!request.value.trim()) { request.focus(); return; }
    $("error").hidden = true;
    setBusy(true);
    vscode.postMessage({ type: "generate", request: request.value, engine: state.engine });
  }
  $("generate").addEventListener("click", generate);
  $("cancel").addEventListener("click", () => vscode.postMessage({ type: "cancel" }));
  $("copy").addEventListener("click", () => vscode.postMessage({ type: "copy", text: state.result }));
  $("run").addEventListener("click", () => vscode.postMessage({ type: "runInClaude", text: state.result }));
  $("insert").addEventListener("click", () => vscode.postMessage({ type: "insert", text: state.result }));

  window.addEventListener("message", ({ data }) => {
    switch (data.type) {
      case "status":
        $("status").textContent = data.text;
        break;
      case "sources": {
        const list = data.files.length ? data.files.map((f) => "<code>" + f.replace(/</g, "&lt;") + "</code>").join(", ") : "none found";
        const active = data.activeFile ? " · active: <code>" + data.activeFile.replace(/</g, "&lt;") + "</code>" : "";
        $("sources").innerHTML = "Context: " + list + active;
        $("sources").hidden = false;
        break;
      }
      case "result":
        setBusy(false);
        showResult(data.text);
        break;
      case "error":
        setBusy(false);
        $("error").textContent = data.text;
        $("error").hidden = false;
        break;
    }
  });
</script>
</body>
</html>`;
  }
}
