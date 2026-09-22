import * as vscode from "vscode";
import { PromptStore, getPromptWebUrl } from "./store";
import { PromptItem, PromptTreeProvider, type PromptView } from "./tree";
import { PromptDetailPanel } from "./detail";
import { AppPanel } from "./app";
import { PromptFixerView } from "./fixer/view";
import { OPENAI_KEY_SECRET } from "./fixer/engines";
import { compilePrompt, extractVariables } from "./variables";
import type { Prompt } from "./types";

/** Tree context-menu commands pass a PromptItem; programmatic calls pass a Prompt. */
function resolvePrompt(arg: Prompt | PromptItem | undefined): Prompt | undefined {
  if (!arg) return undefined;
  return arg instanceof PromptItem ? arg.prompt : arg;
}

/** Ask for each `${variable}` in the prompt; returns undefined if the user cancels. */
async function fillVariables(prompt: Prompt): Promise<string | undefined> {
  const variables = extractVariables(prompt.content);
  const values: Record<string, string> = {};

  for (const [index, variable] of variables.entries()) {
    const value = await vscode.window.showInputBox({
      title: `${prompt.title} (${index + 1}/${variables.length})`,
      prompt: `Value for \${${variable.name}}`,
      value: variable.defaultValue,
      ignoreFocusOut: true,
    });
    if (value === undefined) return undefined;
    values[variable.name] = value;
  }

  return compilePrompt(prompt.content, values);
}

export function activate(context: vscode.ExtensionContext): void {
  const store = new PromptStore(context);

  const views: PromptView[] = ["latest", "categories", "favorites"];
  const providers = views.map((view) => {
    const provider = new PromptTreeProvider(store, view);
    context.subscriptions.push(vscode.window.registerTreeDataProvider(`promptsChat.${view}`, provider));
    return provider;
  });

  const reportLoadError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    providers.forEach((provider) => provider.setError(message));
    vscode.window.showErrorMessage(`prompts.chat: ${message}`, "Open Settings").then((choice) => {
      if (choice) vscode.commands.executeCommand("workbench.action.openSettings", "promptsChat.baseUrl");
    });
  };

  store.initialize().catch(reportLoadError);

  const copy = async (arg?: Prompt | PromptItem) => {
    const prompt = resolvePrompt(arg);
    if (!prompt) return;
    const text = await fillVariables(prompt);
    if (text === undefined) return;
    await vscode.env.clipboard.writeText(text);
    vscode.window.setStatusBarMessage(`$(check) Copied "${prompt.title}"`, 3000);
  };

  const insert = async (arg?: Prompt | PromptItem) => {
    const prompt = resolvePrompt(arg);
    if (!prompt) return;
    const editor = vscode.window.activeTextEditor ?? vscode.window.visibleTextEditors[0];
    if (!editor) {
      vscode.window.showWarningMessage("Open a text editor to insert the prompt, or use Copy instead.");
      return;
    }
    const text = await fillVariables(prompt);
    if (text === undefined) return;
    await editor.edit((edit) => {
      for (const selection of editor.selections) {
        edit.replace(selection, text);
      }
    });
  };

  const openInBrowser = (arg?: Prompt | PromptItem) => {
    const prompt = resolvePrompt(arg);
    if (prompt) vscode.env.openExternal(vscode.Uri.parse(getPromptWebUrl(prompt)));
  };

  const openApp = () => AppPanel.show(context.extensionUri);

  const setFavorite = async (arg: Prompt | PromptItem | undefined, favorite: boolean) => {
    const prompt = resolvePrompt(arg);
    if (!prompt) return;
    await store.setFavorite(prompt.id, favorite);
    PromptDetailPanel.refreshFavorite(prompt.id, favorite);
  };

  const open = (arg?: Prompt | PromptItem) => {
    const prompt = resolvePrompt(arg);
    if (!prompt) return;
    PromptDetailPanel.show(prompt, store.isFavorite(prompt.id), (action, shown) => {
      switch (action) {
        case "copy":
          return copy(shown);
        case "insert":
          return insert(shown);
        case "openInBrowser":
          return openInBrowser(shown);
        case "toggleFavorite":
          return setFavorite(shown, !store.isFavorite(shown.id));
      }
    });
  };

  const search = async () => {
    try {
      await store.ensureLoaded();
    } catch (error) {
      return reportLoadError(error);
    }

    const picked = await vscode.window.showQuickPick(
      store.all.map((prompt) => ({
        label: prompt.title,
        description: `@${prompt.author.username}${prompt.category ? ` · ${prompt.category.name}` : ""}`,
        detail: prompt.description ?? prompt.content.slice(0, 160).replace(/\s+/g, " "),
        prompt,
      })),
      {
        title: "prompts.chat",
        placeHolder: `Search ${store.all.length} prompts by title, author, category or description`,
        matchOnDescription: true,
        matchOnDetail: true,
      },
    );
    if (picked) open(picked.prompt);
  };

  const random = async () => {
    try {
      await store.ensureLoaded();
    } catch (error) {
      return reportLoadError(error);
    }
    if (store.all.length === 0) return;
    open(store.all[Math.floor(Math.random() * store.all.length)]);
  };

  const refresh = () =>
    vscode.window
      .withProgress(
        { location: { viewId: "promptsChat.latest" }, title: "Refreshing prompts" },
        () => store.refresh(),
      )
      .then(
        () => vscode.window.setStatusBarMessage(`$(check) Loaded ${store.all.length} prompts`, 3000),
        reportLoadError,
      );

  const setOpenAIKey = async () => {
    const key = await vscode.window.showInputBox({
      title: "OpenAI API Key",
      prompt: "Stored in VS Code's secret storage. Leave empty to remove.",
      password: true,
      ignoreFocusOut: true,
    });
    if (key === undefined) return;
    if (key.trim()) {
      await context.secrets.store(OPENAI_KEY_SECRET, key.trim());
      vscode.window.showInformationMessage("OpenAI API key saved.");
    } else {
      await context.secrets.delete(OPENAI_KEY_SECRET);
      vscode.window.showInformationMessage("OpenAI API key removed.");
    }
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PromptFixerView.viewId, new PromptFixerView(context), {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("promptsChat.setOpenAIKey", setOpenAIKey),
    vscode.commands.registerCommand("promptsChat.openApp", openApp),
    vscode.commands.registerCommand("promptsChat.search", search),
    vscode.commands.registerCommand("promptsChat.random", random),
    vscode.commands.registerCommand("promptsChat.refresh", refresh),
    vscode.commands.registerCommand("promptsChat.open", open),
    vscode.commands.registerCommand("promptsChat.copy", copy),
    vscode.commands.registerCommand("promptsChat.insert", insert),
    vscode.commands.registerCommand("promptsChat.openInBrowser", openInBrowser),
    vscode.commands.registerCommand("promptsChat.addFavorite", (arg) => setFavorite(arg, true)),
    vscode.commands.registerCommand("promptsChat.removeFavorite", (arg) => setFavorite(arg, false)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("promptsChat.baseUrl")) {
        refresh();
        AppPanel.reload();
      }
    }),
  );
}

export function deactivate(): void {}
