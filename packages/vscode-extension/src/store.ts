import * as vscode from "vscode";
import type { Prompt, PromptsJsonItem, PromptsJsonResponse } from "./types";

const CACHE_FILE = "prompts-cache.json";
const FAVORITES_KEY = "promptsChat.favorites";

interface CacheFile {
  baseUrl: string;
  fetchedAt: number;
  prompts: Prompt[];
}

export function getBaseUrl(): string {
  const baseUrl = vscode.workspace.getConfiguration("promptsChat").get<string>("baseUrl");
  return (baseUrl || "https://prompts.chat").trim().replace(/\/+$/, "");
}

export function getPromptWebUrl(prompt: Prompt): string {
  const path = prompt.slug ? `${prompt.id}_${prompt.slug}` : prompt.id;
  return `${getBaseUrl()}/prompts/${path}`;
}

export function toPrompt(item: PromptsJsonItem): Prompt {
  return {
    id: item.id,
    title: item.title,
    slug: item.slug,
    description: item.description,
    content: item.content ?? item.contentPreview ?? "",
    type: item.type,
    voteCount: item.voteCount ?? 0,
    createdAt: item.createdAt,
    category: item.category ? { name: item.category.name, slug: item.category.slug } : null,
    author: { username: item.author.username, name: item.author.name },
    tags: (item.tags ?? []).map((t) => ("tag" in t ? t.tag.name : t.name)),
  };
}

/**
 * Holds all public prompts in memory, backed by a JSON cache in the
 * extension's global storage so browsing and search work offline.
 */
export class PromptStore {
  private prompts: Prompt[] = [];
  private fetchedAt = 0;
  private loading: Promise<void> | undefined;
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changeEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  get all(): readonly Prompt[] {
    return this.prompts;
  }

  get isLoaded(): boolean {
    return this.fetchedAt > 0;
  }

  /** Load from disk cache, then refresh from the network if the cache is stale or missing. */
  async initialize(): Promise<void> {
    await this.readCache();
    const maxAgeHours = vscode.workspace.getConfiguration("promptsChat").get<number>("cacheMaxAgeHours", 24);
    const isStale = maxAgeHours > 0 && Date.now() - this.fetchedAt > maxAgeHours * 3_600_000;
    if (!this.isLoaded || isStale) {
      await this.refresh().catch((error) => {
        if (!this.isLoaded) throw error;
      });
    }
  }

  /** Download all prompts from the configured instance. Concurrent calls share one request. */
  refresh(): Promise<void> {
    this.loading ??= this.download().finally(() => {
      this.loading = undefined;
    });
    return this.loading;
  }

  async ensureLoaded(): Promise<void> {
    if (this.isLoaded) return;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "prompts.chat: Loading prompts…" },
      () => this.refresh(),
    );
  }

  byCategory(): Map<string, Prompt[]> {
    const groups = new Map<string, Prompt[]>();
    for (const prompt of this.prompts) {
      const name = prompt.category?.name ?? "Uncategorized";
      const group = groups.get(name) ?? [];
      group.push(prompt);
      groups.set(name, group);
    }
    return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }

  latest(limit: number): Prompt[] {
    return [...this.prompts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  get favoriteIds(): string[] {
    return this.context.globalState.get<string[]>(FAVORITES_KEY, []);
  }

  favorites(): Prompt[] {
    const ids = new Set(this.favoriteIds);
    return this.prompts.filter((p) => ids.has(p.id));
  }

  isFavorite(id: string): boolean {
    return this.favoriteIds.includes(id);
  }

  async setFavorite(id: string, favorite: boolean): Promise<void> {
    const ids = this.favoriteIds.filter((existing) => existing !== id);
    if (favorite) ids.push(id);
    await this.context.globalState.update(FAVORITES_KEY, ids);
    this.changeEmitter.fire();
  }

  private async download(): Promise<void> {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/prompts.json?full_content=true`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Failed to load prompts from ${baseUrl} (HTTP ${response.status})`);
    }

    const data = (await response.json()) as PromptsJsonResponse;
    this.prompts = data.prompts.map(toPrompt);
    this.fetchedAt = Date.now();
    await this.writeCache(baseUrl);
    this.changeEmitter.fire();
  }

  private get cacheUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.context.globalStorageUri, CACHE_FILE);
  }

  private async readCache(): Promise<void> {
    try {
      const raw = await vscode.workspace.fs.readFile(this.cacheUri);
      const cache = JSON.parse(Buffer.from(raw).toString("utf8")) as CacheFile;
      // A cache from a different instance is ignored so switching baseUrl shows the right prompts
      if (cache.baseUrl !== getBaseUrl()) return;
      this.prompts = cache.prompts;
      this.fetchedAt = cache.fetchedAt;
      this.changeEmitter.fire();
    } catch {
      // No cache yet or unreadable — the next refresh recreates it
    }
  }

  private async writeCache(baseUrl: string): Promise<void> {
    const cache: CacheFile = { baseUrl, fetchedAt: this.fetchedAt, prompts: this.prompts };
    await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
    await vscode.workspace.fs.writeFile(this.cacheUri, Buffer.from(JSON.stringify(cache), "utf8"));
  }
}
