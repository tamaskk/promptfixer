export interface Prompt {
  id: string;
  title: string;
  slug: string | null;
  description: string | null;
  content: string;
  type: string;
  voteCount: number;
  createdAt: string;
  category: { name: string; slug: string } | null;
  author: { username: string; name: string | null };
  tags: string[];
}

/** Shape of one entry in `/prompts.json?full_content=true`. */
export interface PromptsJsonItem {
  id: string;
  title: string;
  slug: string | null;
  description: string | null;
  content?: string;
  contentPreview?: string;
  type: string;
  voteCount: number;
  createdAt: string;
  category: { name: string; slug: string } | null;
  author: { username: string; name: string | null };
  tags: Array<{ tag: { name: string } } | { name: string }>;
}

export interface PromptsJsonResponse {
  prompts: PromptsJsonItem[];
}
