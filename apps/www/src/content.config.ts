import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { projectSchema, writingSchema } from "@anipotts/content/public/schema";
import {
  homepageSchema,
  listingPageSchema,
  workPageSchema,
  systemsPageSchema,
} from "@anipotts/content/public/pages";

export const collections = {
  home: defineCollection({
    loader: glob({ pattern: "home.md", base: "../../content/public/pages" }),
    schema: homepageSchema,
  }),
  workPage: defineCollection({
    loader: glob({ pattern: "work.md", base: "../../content/public/pages" }),
    schema: workPageSchema,
  }),
  writingPage: defineCollection({
    loader: glob({ pattern: "writing.md", base: "../../content/public/pages" }),
    schema: listingPageSchema,
  }),
  systemsPage: defineCollection({
    loader: glob({ pattern: "systems.md", base: "../../content/public/pages" }),
    schema: systemsPageSchema,
  }),
  writing: defineCollection({
    loader: glob({ pattern: "*.md", base: "../../content/public/writing" }),
    schema: writingSchema,
  }),
  projects: defineCollection({
    loader: glob({ pattern: "*.md", base: "../../content/public/projects" }),
    schema: projectSchema,
  }),
};
