import * as vscode from "vscode";
import type { Prompt } from "./types";
import type { PromptStore } from "./store";

const LATEST_LIMIT = 100;

export class PromptItem extends vscode.TreeItem {
  constructor(readonly prompt: Prompt, isFavorite: boolean) {
    super(prompt.title, vscode.TreeItemCollapsibleState.None);
    this.description = `@${prompt.author.username}`;
    this.tooltip = new vscode.MarkdownString(
      [`**${prompt.title}**`, prompt.description ?? "", `▲ ${prompt.voteCount} · ${prompt.type}`]
        .filter(Boolean)
        .join("\n\n"),
    );
    this.iconPath = new vscode.ThemeIcon(isFavorite ? "star-full" : "comment-discussion");
    this.contextValue = isFavorite ? "prompt-favorite" : "prompt";
    this.command = { command: "promptsChat.open", title: "Open Prompt", arguments: [prompt] };
  }
}

class CategoryItem extends vscode.TreeItem {
  constructor(readonly name: string, readonly prompts: Prompt[]) {
    super(name, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = String(prompts.length);
    this.iconPath = new vscode.ThemeIcon("folder");
    this.contextValue = "category";
  }
}

class MessageItem extends vscode.TreeItem {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.tooltip = message;
    this.iconPath = new vscode.ThemeIcon("info");
  }
}

type Node = PromptItem | CategoryItem | MessageItem;
export type PromptView = "latest" | "categories" | "favorites";

export class PromptTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  private error: string | undefined;

  constructor(private readonly store: PromptStore, private readonly view: PromptView) {
    store.onDidChange(() => {
      this.error = undefined;
      this.changeEmitter.fire();
    });
  }

  setError(message: string): void {
    this.error = message;
    this.changeEmitter.fire();
  }

  getTreeItem(element: Node): vscode.TreeItem {
    return element;
  }

  getChildren(element?: Node): Node[] {
    const toItem = (p: Prompt) => new PromptItem(p, this.store.isFavorite(p.id));

    if (element instanceof CategoryItem) {
      return element.prompts.map(toItem);
    }
    if (element) return [];

    if (!this.store.isLoaded) {
      return this.view === "favorites" ? [] : [new MessageItem(this.error ?? "Loading prompts…")];
    }

    switch (this.view) {
      case "latest":
        return this.store.latest(LATEST_LIMIT).map(toItem);
      case "categories":
        return [...this.store.byCategory()].map(([name, prompts]) => new CategoryItem(name, prompts));
      case "favorites":
        return this.store.favorites().map(toItem);
    }
  }
}
