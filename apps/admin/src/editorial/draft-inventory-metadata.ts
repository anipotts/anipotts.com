import { editorialRecordKind } from "@anipotts/content/editorial/layout";
import {
  editorialRecordSchema,
  parseEditorialSource,
  type EditorialRecord,
} from "@anipotts/content/editorial/source";
import { gitBlobSha1 } from "../lib/crypto";
import { editorialRecordSummary } from "../lib/editorial-record-summary";
import {
  projectRecordIdentity,
  type ProjectRecordIdentity,
} from "../lib/project-media";
import type { Draft } from "./draft-store";

export type InventoryDraftMetadata = Pick<
  Draft,
  "key" | "revision" | "updatedAt" | "discardedAt"
> & {
  title?: string;
  summary?: string;
  visibility?: string;
  projectIdentity?: ProjectRecordIdentity;
  changesPending: boolean;
};

function metadata(source: string): Record<string, unknown> {
  try {
    return parseEditorialSource(source).data as Record<string, unknown>;
  } catch {
    return {};
  }
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
function draftRecord(key: string): EditorialRecord | null {
  const match =
    /^content\/public\/(pages|projects|writing)\/([^/]+)\.md$/u.exec(key);
  if (!match) return null;
  const parsed = editorialRecordSchema.safeParse({
    kind: editorialRecordKind(match[1]!),
    id: match[2],
  });
  return parsed.success ? parsed.data : null;
}

/** Calculate the exact current-source comparison inside the private store.
 * Only table and palette fields leave that store for the overview. */
export function inventoryDraftMetadata(draft: Draft): InventoryDraftMetadata {
  const record = draftRecord(draft.key);
  const data = metadata(draft.source);
  return {
    key: draft.key,
    revision: draft.revision,
    updatedAt: draft.updatedAt,
    discardedAt: draft.discardedAt,
    title: text(data.title),
    summary: record ? editorialRecordSummary(record, data) : undefined,
    visibility: text(record?.kind === "work" ? data.public_state : data.status),
    projectIdentity:
      record?.kind === "work" ? projectRecordIdentity(data) : undefined,
    changesPending: gitBlobSha1(draft.source) !== draft.baseFileHash,
  };
}
