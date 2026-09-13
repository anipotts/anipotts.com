import { z } from "zod";
import {
  editorialRecordSchema,
  MAX_SOURCE_BYTES,
  validateEditorialSource,
  type EditorialRecord,
} from "./source.js";

/** V1 is the existing YAML-frontmatter/Markdown content contract. A future
 * incompatible schema must keep this decoder and introduce a new version. */
export const CONTENT_SCHEMA_VERSION = 1 as const;
export const contentSchemaVersionSchema = z.literal(CONTENT_SCHEMA_VERSION);
export const publicationOperationIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
export const publicationTimestampSchema = z
  .string()
  .max(64)
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)));
const sourceSchema = z
  .string()
  .max(MAX_SOURCE_BYTES)
  .refine(
    (source) => new TextEncoder().encode(source).byteLength <= MAX_SOURCE_BYTES,
  );
const snapshotSchema = z
  .object({
    contentSchemaVersion: contentSchemaVersionSchema,
    publicationId: publicationOperationIdSchema,
    record: editorialRecordSchema,
    source: sourceSchema,
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    publishedAt: publicationTimestampSchema,
  })
  .strict();
export type PublishedSnapshot = z.infer<typeof snapshotSchema>;
export class PublicationContractError extends Error {
  constructor(
    readonly code:
      | "unsupported_content_schema"
      | "invalid_published_snapshot"
      | "invalid_publication_source"
      | "publication_hash_mismatch",
  ) {
    super(code);
    this.name = "PublicationContractError";
  }
}
export function assertContentSchemaVersion(
  version: unknown,
): asserts version is 1 {
  if (version !== CONTENT_SCHEMA_VERSION)
    throw new PublicationContractError("unsupported_content_schema");
}
export function validatePublicationSource(
  record: EditorialRecord,
  source: string,
  contentSchemaVersion: unknown,
): void {
  assertContentSchemaVersion(contentSchemaVersion);
  try {
    if (
      sourceSchema.safeParse(source).success &&
      validateEditorialSource(record, source).success
    )
      return;
  } catch {
    // Keep source/YAML/provider details out of public error responses.
  }
  throw new PublicationContractError("invalid_publication_source");
}
export async function publicationSourceHash(source: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Reject before rendering. Source remains exact; parsed projections never replace it. */
export async function decodePublishedSnapshot(
  input: unknown,
): Promise<PublishedSnapshot> {
  if (input && typeof input === "object" && "contentSchemaVersion" in input)
    assertContentSchemaVersion(input.contentSchemaVersion);
  const result = snapshotSchema.safeParse(input);
  if (!result.success)
    throw new PublicationContractError("invalid_published_snapshot");
  const value = result.data;
  validatePublicationSource(
    value.record,
    value.source,
    value.contentSchemaVersion,
  );
  if ((await publicationSourceHash(value.source)) !== value.sourceSha256)
    throw new PublicationContractError("publication_hash_mismatch");
  return value;
}
