import type { ProjectContext } from "./context";

export const SYSTEM_PROMPT = `You are a prompt engineer for Claude Code, an agentic coding assistant that works inside a software project.

The developer typed a short, informal request. Rewrite it into one clear, self-contained prompt that Claude Code can act on immediately in THIS project.

Use the project instructions provided (CLAUDE.md, AGENTS.md, .claude/ commands, agents, skills and settings):
- Follow the project's conventions, tech stack, commands and rules; mention the relevant ones explicitly (e.g. which lint/test/type-check commands to run, translation or styling rules).
- Point Claude Code to the relevant files or areas when the context makes them clear, including the active file and selection.
- If a project slash command, agent or skill fits the task, suggest using it.
- State the goal, constraints, and how to verify the result (definition of done).
- Keep the developer's intent; do not invent requirements. If something is ambiguous, tell Claude Code to investigate first rather than guessing.
- Write in the same language the developer used.

Output ONLY the final prompt text, with no preamble, explanation or surrounding code fences.`;

export function buildUserMessage(request: string, context: ProjectContext | undefined): string {
  const parts: string[] = [];

  if (context) {
    if (context.files.length > 0) {
      parts.push("<project_instructions>");
      for (const file of context.files) {
        parts.push(`<file path="${file.path}"${file.truncated ? ' truncated="true"' : ""}>\n${file.content}\n</file>`);
      }
      parts.push("</project_instructions>");
    } else {
      parts.push("<project_instructions>No CLAUDE.md, AGENTS.md or .claude/ files were found in this project.</project_instructions>");
    }

    if (context.activeFile) {
      const { path, language, selection } = context.activeFile;
      parts.push(`<active_file path="${path}" language="${language}">`);
      if (selection) parts.push(`<selection>\n${selection}\n</selection>`);
      parts.push("</active_file>");
    }
  }

  parts.push(`<developer_request>\n${request}\n</developer_request>`);
  return parts.join("\n\n");
}
