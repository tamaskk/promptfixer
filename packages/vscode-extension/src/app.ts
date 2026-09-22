import * as vscode from "vscode";
import { getBaseUrl } from "./store";

/** Editor tab that embeds the full prompts.chat web app in an iframe. */
export class AppPanel {
  private static current: AppPanel | undefined;

  static show(extensionUri: vscode.Uri, path = "/"): void {
    if (AppPanel.current) {
      AppPanel.current.panel.reveal(vscode.ViewColumn.Active);
      return;
    }
    const panel = vscode.window.createWebviewPanel("promptsChat.app", "prompts.chat", vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    panel.iconPath = vscode.Uri.joinPath(extensionUri, "media", "icon.png");
    AppPanel.current = new AppPanel(panel, path);
  }

  /** Reload the embedded app, e.g. after the base URL setting changed. */
  static reload(): void {
    AppPanel.current?.load("/");
  }

  private constructor(private readonly panel: vscode.WebviewPanel, path: string) {
    this.load(path);
    panel.webview.onDidReceiveMessage((message: { action: string }) => {
      if (message.action === "openExternal") {
        vscode.env.openExternal(vscode.Uri.parse(getBaseUrl()));
      } else if (message.action === "reload") {
        this.load("/");
      }
    });
    panel.onDidDispose(() => {
      AppPanel.current = undefined;
    });
  }

  private load(path: string): void {
    const baseUrl = getBaseUrl();
    const src = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const origin = new URL(baseUrl).origin;
    const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
    const csp = `default-src 'none'; frame-src ${origin}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;

    // Changing the html forces the iframe to reload, so a cache-busting attribute keeps repeated loads working
    this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style nonce="${nonce}">
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: var(--vscode-editor-background); }
  .bar { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 8px; font-family: var(--vscode-font-family); font-size: 12px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); }
  .bar span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button { background: none; border: none; color: var(--vscode-textLink-foreground); cursor: pointer; font: inherit; padding: 2px 4px; }
  iframe { width: 100%; height: calc(100% - 31px); border: none; background: #fff; }
</style>
</head>
<body data-load="${Date.now()}">
  <div class="bar">
    <span>${src.replace(/</g, "&lt;")}</span>
    <button data-action="reload">Reload</button>
    <button data-action="openExternal">Open in Browser</button>
  </div>
  <iframe src="${src.replace(/"/g, "&quot;")}" allow="clipboard-read; clipboard-write"></iframe>
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
