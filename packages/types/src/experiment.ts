export type ExperimentStatus = "active" | "archived" | "broken" | "completed";

export interface Experiment {
  slug: string;
  title: string;
  description: string;
  status: ExperimentStatus;
  createdAt: string;
  updatedAt?: string;
  tags: string[];
  demoUrl?: string;
  repoUrl?: string;
}
