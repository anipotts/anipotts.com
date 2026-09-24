import { z } from "zod";

/** A record's identity and the source size bound, apart from the source
 * parser in ./source, so a browser can check identities and sizes without
 * loading the YAML and Markdown parsers. ./source re-exports all of it. */
export const MAX_SOURCE_BYTES = 512 * 1024;
const recordId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(120);

export const editorialRecordSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("page"),
      id: z.enum(["home", "work", "writing", "systems", "newsletter"]),
    })
    .strict(),
  z.object({ kind: z.literal("work"), id: recordId }).strict(),
  z.object({ kind: z.literal("writing"), id: recordId }).strict(),
]);
export type EditorialRecord = z.infer<typeof editorialRecordSchema>;
