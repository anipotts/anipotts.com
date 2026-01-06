export type ProjectCategory = "ai" | "product" | "quant" | "music" | "other";

export interface Project {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  year: string;
  category: ProjectCategory;
  role: string;
  duration: string;
  tags: string[];
  links?: {
    live?: string;
    repo?: string;
  };
}
