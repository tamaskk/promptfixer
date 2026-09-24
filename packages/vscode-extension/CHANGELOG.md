# Changelog

## 0.3.0

- Prompt Fixer uses the local Codex CLI (`codex exec`, read-only sandbox) instead of the OpenAI API — no API key needed

## 0.2.0

- Prompt Fixer: turn a quick request (e.g. "fix it please") into a project-aware prompt using CLAUDE.md, AGENTS.md and .claude/
- Choose GPT-4o or the Claude CLI with one click; copy, insert or run the result in Claude Code

## 0.1.1

- Show the full load error in a tooltip
- Fix formatting of the empty Favorites message

## 0.1.0

- Open App command: embeds the full web app in an editor tab
- Initial release: browse latest prompts, categories and favorites in the sidebar
- Search and random prompt commands
- Copy or insert prompts at the cursor, with `${variable}` filling
- Offline cache and configurable `promptsChat.baseUrl`
