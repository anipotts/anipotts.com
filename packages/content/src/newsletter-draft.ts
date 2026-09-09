import { z } from "zod";
import { publicSlugSchema } from "./public/schema.js";

const section = z.object({
  kind: z.enum(["opening", "note", "receipt", "worklog", "close"]),
  heading: z.string().optional(),
  label: z.string().optional(),
  body: z.string(),
  items: z.array(z.string()).optional(),
  source_refs: z.array(z.string()).optional(),
  thread_beat: z.string().optional(),
});

export const newsletterDraftSchema = z.object({
  id: z.string().min(1),
  slug: publicSlugSchema,
  status: z.enum(["idea", "draft", "preview", "ready_for_review", "blocked"]),
  title: z.string().min(1),
  subject: z.string().min(1),
  summary: z.string(),
  dek: z.string(),
  audience: z.string(),
  source_refs: z.array(z.object({ ref: z.string(), use: z.string() })),
  spine: z.array(z.string()),
  hook: section,
  sections: z.array(section),
  close: z.object({
    kind: z.literal("close"),
    body: z.string(),
    cta: z.string(),
  }),
  claims: z.array(
    z.object({
      claim: z.string(),
      status: z.enum(["source_backed", "needs_proof"]),
      source_refs: z.array(z.string()),
    }),
  ),
  x_thread_beats: z.array(z.string()),
  blocked_actions: z.array(z.string()),
  preview_notes: z.string(),
  source_fixture: z.string(),
  preview_fixture: z.string(),
  pipeline: z.object({
    lane: z.enum(["backfill", "new_draft", "evergreen"]),
    stage: z.enum([
      "ready_for_review",
      "voice_pass",
      "needs_source",
      "fallback_ready",
    ]),
    energy: z.enum(["low", "medium"]),
    next_action: z.string(),
  }),
});

export type NewsletterDraft = z.infer<typeof newsletterDraftSchema>;
