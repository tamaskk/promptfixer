export interface Variable {
  name: string;
  defaultValue: string;
}

const VARIABLE_PATTERN = /\$\{([^}:]+)(?::([^}]*))?\}/g;

/** Extract `${name}` / `${name:default}` placeholders, first occurrence wins. */
export function extractVariables(content: string): Variable[] {
  const variables: Variable[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(VARIABLE_PATTERN)) {
    const name = match[1].trim();
    if (!seen.has(name)) {
      seen.add(name);
      variables.push({ name, defaultValue: match[2]?.trim() ?? "" });
    }
  }

  return variables;
}

/** Replace placeholders with the given values, falling back to their defaults. */
export function compilePrompt(template: string, values: Record<string, string>): string {
  return template.replace(VARIABLE_PATTERN, (match, name: string, defaultValue?: string) => {
    const value = values[name.trim()];
    if (value !== undefined && value !== "") return value;
    return defaultValue?.trim() || match;
  });
}
