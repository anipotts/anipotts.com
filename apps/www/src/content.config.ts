import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const status = z.enum(["draft", "scheduled", "published"]);
const phosphor = z
  .string()
  .regex(/^[a-z-]+$/, "phosphor icon name only")
  .optional();

const projectMedia = z.object({
  kind: z.enum(["image", "gif", "video"]),
  src: z.string().startsWith("/"),
  alt: z.string().min(1),
  caption: z.string().min(1).optional(),
  fit: z.enum(["cover", "contain"]).default("cover"),
});

const writing = defineCollection({
  loader: glob({ pattern: "*.md", base: "../../content/public/writing" }),
  schema: z
    .object({
      title: z.string(),
      slug: z.string().optional(),
      summary: z.string().min(1),
      status: status.default("draft"),
      published_at: z.coerce.date().optional(),
      scheduled_at: z.coerce.date().optional(),
      tags: z.array(z.string()).default([]),
      content_type: z.enum(["article", "note", "playbook"]).default("article"),
      series_type: z.string().optional(),
      project: z.string().optional(),
      artifact_url: z.string().url().optional(),
      artifact_label: z.string().max(80).optional(),
      artifact_type: z
        .enum(["repo", "gist", "demo", "screenshot", "recording"])
        .optional(),
    })
    .refine((d) => d.status !== "published" || Boolean(d.published_at), {
      message: "published writing needs published_at",
    })
    .refine((d) => d.status !== "scheduled" || Boolean(d.scheduled_at), {
      message: "scheduled writing needs scheduled_at",
    }),
});

const projects = defineCollection({
  loader: glob({ pattern: "*.md", base: "../../content/public/projects" }),
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    subtitle: z.string().optional(),
    description: z.string(),
    year: z.string(),
    category: z.enum(["ai", "product", "quant", "music", "other"]),
    role: z.string(),
    duration: z.string(),
    status: z.enum(["live", "wip", "archived"]),
    kind: z.enum(["experience", "project"]),
    public_state: z.enum(["featured", "listed", "hidden"]),
    homepage_placement: z.enum(["experience", "making", "none"]),
    catalog_group: z.enum(["active", "past", "taken_down"]),
    homepage_order: z.number().default(0),
    card_copy: z.string().min(1).max(180),
    detail_path: z.string().regex(/^\/projects\/[a-z0-9-]+$/),
    identity: z.object({
      logo_src: z.string().startsWith("/").optional(),
      logo_alt: z.string().min(1).optional(),
      logo_tone: z.enum(["default", "light", "adaptive"]).default("default"),
      icon: phosphor,
    }),
    preview_media: projectMedia.nullable().default(null),
    story: z
      .array(
        z.object({
          title: z.string().min(1),
          paragraphs: z.array(z.string().min(1)).min(1),
          media: projectMedia.optional(),
        }),
      )
      .default([]),
    sort_order: z.number().default(0),
    icon: phosphor,
    link_live: z.string().url().optional(),
    link_repo: z.string().url().optional(),
    tags: z.array(z.string()).default([]),
    technical: z
      .array(z.object({ title: z.string(), content: z.string() }))
      .optional(),
    roadmap: z
      .array(
        z.object({
          text: z.string(),
          status: z.enum(["done", "in-progress", "planned"]),
        }),
      )
      .optional(),
  }),
});

export const collections = { writing, projects };
