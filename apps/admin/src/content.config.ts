import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { projectSchema, writingSchema } from "@anipotts/content/public/schema";
import {
  homepageSchema,
  listingPageSchema,
  workPageSchema,
  systemsPageSchema,
  newsletterPageSchema,
} from "@anipotts/content/public/pages";

import { newsletterDraftSchema } from "@anipotts/content/newsletter-draft";

export const collections = {
  newsletterDrafts: defineCollection({
    loader: glob({
      pattern: "*.md",
      base: "../../content/editorial/newsletter",
    }),
    schema: newsletterDraftSchema,
  }),
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
  newsletterPage: defineCollection({
    loader: glob({
      pattern: "newsletter.md",
      base: "../../content/public/pages",
    }),
    schema: newsletterPageSchema,
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
