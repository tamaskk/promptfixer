import * as vscode from "vscode";
import type { Prompt } from "./types";

type DetailAction = "copy" | "insert" | "openInBrowser" | "toggleFavorite";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/** Single reusable webview panel that shows one prompt with action buttons. */
export class PromptDetailPanel {
  private static current: PromptDetailPanel | undefined;
  private prompt: Prompt;

  static show(
    prompt: Prompt,
    isFavorite: boolean,
    onAction: (action: DetailAction, prompt: Prompt) => void,
  ): void {
    if (PromptDetailPanel.current) {
      PromptDetailPanel.current.update(prompt, isFavorite);
      PromptDetailPanel.current.panel.reveal(vscode.ViewColumn.Active);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "promptsChat.detail",
      prompt.title,
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: false },
    );
    PromptDetailPanel.current = new PromptDetailPanel(panel, prompt, isFavorite, onAction);
  }

  /** Refresh the favorite button when the prompt shown is (un)favorited elsewhere. */
  static refreshFavorite(promptId: string, isFavorite: boolean): void {
    const current = PromptDetailPanel.current;
    if (current && current.prompt.id === promptId) {
      current.update(current.prompt, isFavorite);
    }
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    prompt: Prompt,
    isFavorite: boolean,
    onAction: (action: DetailAction, prompt: Prompt) => void,
  ) {
    this.prompt = prompt;
    this.update(prompt, isFavorite);
    panel.webview.onDidReceiveMessage((message: { action: DetailAction }) => onAction(message.action, this.prompt));
    panel.onDidDispose(() => {
      PromptDetailPanel.current = undefined;
    });
  }

  private update(prompt: Prompt, isFavorite: boolean): void {
    this.prompt = prompt;
    this.panel.title = prompt.title;
    this.panel.webview.html = this.render(prompt, isFavorite);
  }

  private render(prompt: Prompt, isFavorite: boolean): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;
    const meta = [
      `@${prompt.author.username}`,
      prompt.category?.name,
      prompt.type,
      `▲ ${prompt.voteCount}`,
    ].filter(Boolean);
    const tags = prompt.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}">
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px 24px; max-width: 900px; }
  h1 { font-size: 1.5em; margin: 0 0 4px; }
  .meta { color: var(--vscode-descriptionForeground); margin-bottom: 12px; }
  .description { margin: 0 0 12px; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
  .tag { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 10px; padding: 1px 8px; font-size: 0.85em; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; border-radius: 2px; cursor: pointer; font: inherit; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  pre { white-space: pre-wrap; word-wrap: break-word; background: var(--vscode-textCodeBlock-background); padding: 12px 16px; border-radius: 4px; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); line-height: 1.5; }
</style>
</head>
<body>
  <h1>${escapeHtml(prompt.title)}</h1>
  <div class="meta">${meta.map((m) => escapeHtml(String(m))).join(" · ")}</div>
  ${prompt.description ? `<p class="description">${escapeHtml(prompt.description)}</p>` : ""}
  ${tags ? `<div class="tags">${tags}</div>` : ""}
  <div class="actions">
    <button data-action="copy">Copy</button>
    <button data-action="insert">Insert at Cursor</button>
    <button class="secondary" data-action="toggleFavorite">${isFavorite ? "★ Remove Favorite" : "☆ Add Favorite"}</button>
    <button class="secondary" data-action="openInBrowser">Open on Website</button>
  </div>
  <pre>${escapeHtml(prompt.content)}</pre>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => vscode.postMessage({ action: button.dataset.action }));
    });
  </script>
</body>
</html>`;
  }
}
