import { createHash } from "node:crypto";
import type { Publication } from "./publication";
import {
  editorialMediaGitPrefix,
  MAX_PUBLICATION_IMAGES,
  MAX_PUBLICATION_MEDIA_BYTES,
  referencedMediaIds,
} from "../lib/editorial-media";

/** The immutable source's content-addressed references bind the exact image bytes. */
export function publicationMediaFiles(publication: Publication) {
  const ids = referencedMediaIds(publication.source);
  const attachments = publication.attachments ?? [];
  if (ids.length > MAX_PUBLICATION_IMAGES || attachments.length !== ids.length)
    throw new Error("invalid_publication_media");
  let total = 0;
  return ids.map((id) => {
    const matches = attachments.filter((file) => file.id === id);
    if (matches.length !== 1) throw new Error("invalid_publication_media");
    const bytes = Buffer.from(matches[0]!.base64, "base64");
    total += bytes.length;
    if (
      !bytes.length ||
      total > MAX_PUBLICATION_MEDIA_BYTES ||
      bytes.toString("base64") !== matches[0]!.base64 ||
      createHash("sha256").update(bytes).digest("hex") !== id.split(".")[0]
    )
      throw new Error("invalid_publication_media");
    return {
      path: `${editorialMediaGitPrefix}${id}`,
      bytes,
      sha256: id.split(".")[0]!,
    };
  });
}
