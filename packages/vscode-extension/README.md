# prompts.chat for VS Code

Search, browse, copy and insert AI prompts from [prompts.chat](https://prompts.chat) — or your own self-hosted instance — without leaving the editor.

## Features

- **Sidebar** (prompts.chat icon in the Activity Bar)
  - **Latest** — the 100 newest prompts
  - **Categories** — all prompts grouped by category
  - **Favorites** — prompts you starred (stored locally, no login needed)
- **Search Prompts** — fuzzy search over title, author, category and description
- **Random Prompt** — get inspired
- **Prompt view** — read the full prompt, then **Copy**, **Insert at Cursor**, favorite it or open it on the website
- **Variables** — prompts with `${name}` or `${name:default}` placeholders ask for values before copying or inserting
- **Offline cache** — prompts are downloaded once and cached; refreshed automatically when older than `promptsChat.cacheMaxAgeHours`

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `promptsChat.baseUrl` | `https://prompts.chat` | Instance to load prompts from, e.g. your Vercel deployment |
| `promptsChat.cacheMaxAgeHours` | `24` | Auto-refresh interval for the local cache (`0` = never) |

## Development

```bash
cd packages/vscode-extension
npm install
npm run compile   # build to dist/
npm test          # unit tests
npm run package   # create prompts-chat-<version>.vsix
```

Press `F5` in VS Code with this folder open to launch an Extension Development Host.

Install the packaged extension with:

```bash
code --install-extension prompts-chat-0.1.0.vsix
```
