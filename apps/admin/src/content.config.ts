import { z } from "astro/zod";
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

// Adapt shared Zod 3 validators without changing their defaults or refinements.
function astroSchema<T>(schema: {
  safeParse(value: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: { issues: { message: string; path: (string | number)[] }[] };
      };
}) {
  return z.unknown().transform((value, ctx) => {
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    for (const issue of result.error.issues) {
      ctx.addIssue({
        code: "custom",
        message: issue.message,
        path: issue.path,
      });
    }
    return z.NEVER;
  });
}

export const collections = {
  newsletterDrafts: defineCollection({
    loader: glob({
      pattern: "*.md",
      base: "../../content/editorial/newsletter",
    }),
    schema: astroSchema(newsletterDraftSchema),
  }),
  home: defineCollection({
    loader: glob({ pattern: "home.md", base: "../../content/public/pages" }),
    schema: astroSchema(homepageSchema),
  }),
  workPage: defineCollection({
    loader: glob({ pattern: "work.md", base: "../../content/public/pages" }),
    schema: astroSchema(workPageSchema),
  }),
  writingPage: defineCollection({
    loader: glob({ pattern: "writing.md", base: "../../content/public/pages" }),
    schema: astroSchema(listingPageSchema),
  }),
  systemsPage: defineCollection({
    loader: glob({ pattern: "systems.md", base: "../../content/public/pages" }),
    schema: astroSchema(systemsPageSchema),
  }),
  newsletterPage: defineCollection({
    loader: glob({
      pattern: "newsletter.md",
      base: "../../content/public/pages",
    }),
    schema: astroSchema(newsletterPageSchema),
  }),
  writing: defineCollection({
    loader: glob({ pattern: "*.md", base: "../../content/public/writing" }),
    schema: astroSchema(writingSchema),
  }),
  projects: defineCollection({
    loader: glob({ pattern: "*.md", base: "../../content/public/projects" }),
    schema: astroSchema(projectSchema),
  }),
};
