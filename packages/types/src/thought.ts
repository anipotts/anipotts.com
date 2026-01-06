export interface Thought {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  published: boolean;
  views: number;
}

export interface ThoughtStats {
  totalViews: number;
  totalThoughts: number;
  publishedCount: number;
  draftCount: number;
  topThoughts: Pick<Thought, 'id' | 'title' | 'slug' | 'views' | 'published' | 'created_at'>[];
}
