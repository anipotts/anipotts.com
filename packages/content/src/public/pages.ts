import { z } from "zod";
import { publicSlugSchema } from "./schema.js";
import { workflowProviders } from "./providers.js";

const text = z.string().min(1);
const link = z.object({ label: text, href: text });
const section = z.object({
  visible: z.boolean(),
  label: text,
  heading: z.string(),
  subheading: text.optional(),
  mention_keys: z.array(text).optional(),
  links: z.array(link).optional(),
  limit: z.number().int().positive().optional(),
  view_all: text.optional(),
  writing_slugs: z.array(publicSlugSchema).optional(),
});

export const homepageMentionSchema = z.object({
  label: text,
  href: text.optional(),
  logoSrc: text.optional(),
  logoAlt: text.optional(),
  logoTone: z.enum(["native", "white"]).optional(),
  logoShape: z.enum(["square", "wide", "mark", "large"]).optional(),
  visualLabel: text.optional(),
  visualPrefix: text.optional(),
  visualSuffix: text.optional(),
  presentation: z.enum(["brand", "facet"]).optional(),
});

export const homepageSchema = z
  .object({
    sections: z.object({
      intro: section.extend({ subheading: text }),
      past_work: section,
      latest_thoughts: section,
    }),
    section_order: z.array(z.enum(["intro", "past_work", "latest_thoughts"])),
    mentions: z.record(homepageMentionSchema),
  })
  .superRefine((home, ctx) => {
    for (const key of home.sections.intro.mention_keys ?? []) {
      if (!home.mentions[key])
        ctx.addIssue({
          code: "custom",
          message: `Unknown homepage mention: ${key}`,
        });
    }
  });

export const listingPageSchema = z.object({
  title: text,
  description: text,
  hero_title: text,
  hero_summary: text,
  section_label: text.optional(),
});

export const workPageSchema = listingPageSchema.extend({
  buckets: z
    .array(
      z.object({
        id: z.enum(["experience", "selected", "archive"]),
        label: text,
        note: text,
      }),
    )
    .length(3),
});

const providerId = text.refine(
  (id) => Object.hasOwn(workflowProviders, id),
  "Unknown workflow provider",
);
export const systemsPageSchema = listingPageSchema.extend({
  workflow: z.object({
    intro: text,
    outro: text.optional(),
    sources: z.array(providerId).min(1),
    steps: z
      .array(
        z.object({
          id: text,
          label: text,
          detail: text,
          marks: z.array(providerId),
        }),
      )
      .length(4),
    feedback: text,
  }),
});

export const newsletterPageSchema = z.object({
  status: z.literal("draft").default("draft"),
  headline: text,
  deck: text,
  cta_label: text,
  success_message: text,
  error_message: text,
  footer_text: text,
  buttondown_url: z.string().url(),
  archive_label: text,
  archive_copy: text,
  archive_link_label: text,
  archive_url: text,
  sender_name: text,
  sender_email: z.string().email(),
  reply_to: z.string().email(),
});

export type Homepage = z.infer<typeof homepageSchema>;
export type HomepageMention = z.infer<typeof homepageMentionSchema>;
export type SystemsPage = z.infer<typeof systemsPageSchema>;
