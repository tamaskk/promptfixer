# prompts.chat for VS Code

Search, browse, copy and insert AI prompts from [prompts.chat](https://prompts.chat) — or your own self-hosted instance — without leaving the editor.

## Features

- **Prompt Fixer** — type a quick request like "fix it please"; the extension reads the project's `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, nested `CLAUDE.md` files, `.claude/` (commands, agents, skills, rules, settings), the `.mcp.json` server names and the active file/selection, then generates a precise prompt for Claude Code
  - One-click engine switch: **GPT-4o** (OpenAI API key via *prompts.chat: Set OpenAI API Key* or `OPENAI_API_KEY`) or **Claude CLI** (`claude -p`, read-only tools)
  - **Copy**, **Insert** or **Run in Claude Code** (opens a terminal running `claude` with the prompt)
- **Open App** — the full prompts.chat web app in an editor tab (globe icon in the sidebar)
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
| `promptsChat.baseUrl` | `http://localhost:2342` | Instance to load prompts from, e.g. `https://prompts.chat` or your own deployment |
| `promptsChat.cacheMaxAgeHours` | `24` | Auto-refresh interval for the local cache (`0` = never) |
| `promptsChat.fixer.openaiModel` | `gpt-4o` | Model for the GPT-4o engine |
| `promptsChat.fixer.openaiBaseUrl` | `https://api.openai.com/v1` | OpenAI-compatible API base URL |
| `promptsChat.fixer.claudePath` | `claude` | Claude CLI path (auto-detected) |
| `promptsChat.fixer.claudeModel` | *(empty)* | Optional `--model` for the Claude CLI |

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
code --install-extension prompts-chat-0.2.0.vsix
```
