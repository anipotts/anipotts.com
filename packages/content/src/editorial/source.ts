import { isAlias, isMap, isNode, parseDocument, visit } from "yaml";
import { z } from "zod";
import {
  homepageSchema,
  listingPageSchema,
  newsletterPageSchema,
  systemsPageSchema,
  workPageSchema,
} from "../public/pages.js";
import { projectSchema, writingSchema } from "../public/schema.js";

export const MAX_SOURCE_BYTES = 512 * 1024;
const recordId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(120);
const pageSchemas = {
  home: homepageSchema,
  work: workPageSchema,
  writing: listingPageSchema,
  systems: systemsPageSchema,
  newsletter: newsletterPageSchema,
} as const;

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

/** Paths are derived only from validated identities, never supplied by clients. */
export function editorialRecordPath(input: unknown): string {
  const record = editorialRecordSchema.parse(input);
  const directory =
    record.kind === "page"
      ? "pages"
      : record.kind === "work"
        ? "projects"
        : "writing";
  return `content/public/${directory}/${record.id}.md`;
}

export class SourceError extends Error {
  constructor(
    public readonly code:
      | "source_too_large"
      | "invalid_frontmatter"
      | "unsafe_yaml"
      | "invalid_field",
  ) {
    super(code);
    this.name = "SourceError";
  }
}

/** Parse without normalizing the source. Invalid intermediate drafts are stored elsewhere unchanged. */
export function parseEditorialSource(source: string) {
  if (new TextEncoder().encode(source).byteLength > MAX_SOURCE_BYTES) {
    throw new SourceError("source_too_large");
  }
  const opening = /^(?:\uFEFF)?---(\r?\n)/u.exec(source);
  if (!opening) throw new SourceError("invalid_frontmatter");
  const closing = /^---[\t ]*(?:\r?\n|$)/gmu;
  closing.lastIndex = opening[0].length;
  const end = closing.exec(source);
  if (!end) throw new SourceError("invalid_frontmatter");
  const yaml = source.slice(opening[0].length, end.index);
  const document = parseDocument(yaml, {
    uniqueKeys: true,
    strict: true,
    schema: "core",
  });
  if (
    document.errors.length ||
    document.warnings.length ||
    !isMap(document.contents)
  ) {
    throw new SourceError("invalid_frontmatter");
  }
  visit(document, (_key, node) => {
    if (
      isAlias(node) ||
      (isNode(node) && (node.tag || ("anchor" in node && node.anchor)))
    ) {
      throw new SourceError("unsafe_yaml");
    }
  });
  const data: unknown = document.toJS({ maxAliasCount: 0 });
  return {
    document,
    data,
    body: source.slice(end.index + end[0].length),
    opening: opening[0],
    closing: end[0],
    newline: opening[1]!,
  };
}

/** Preserve the original bytes on no-op edits, and retain YAML nodes/comments on real edits. */
export function setEditorialField(
  source: string,
  path: readonly string[],
  value: unknown,
): string {
  if (
    !path.length ||
    path.some(
      (part) =>
        !part || ["__proto__", "constructor", "prototype"].includes(part),
    )
  ) {
    throw new SourceError("invalid_field");
  }
  const parsed = parseEditorialSource(source);
  const existing: unknown = parsed.document.getIn([...path]);
  if (Object.is(existing, value)) return source;
  parsed.document.setIn([...path], value);
  const yaml = parsed.document
    .toString({ lineWidth: 0 })
    .replace(/\r?\n/gu, parsed.newline);
  return `${parsed.opening}${yaml}${parsed.closing}${parsed.body}`;
}

export function validateEditorialSource(
  record: EditorialRecord,
  source: string,
) {
  const identity = editorialRecordSchema.parse(record);
  const parsed = parseEditorialSource(source);
  const schema =
    identity.kind === "page"
      ? pageSchemas[identity.id]
      : identity.kind === "work"
        ? projectSchema
        : writingSchema;
  return schema.safeParse(parsed.data);
}
