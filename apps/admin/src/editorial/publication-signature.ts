import { createPrivateKey } from "node:crypto";
import { FlattenedSign, importPKCS8 } from "jose";
import {
  editorialRecordPath,
  MAX_SOURCE_BYTES,
} from "@anipotts/content/editorial/source";
import type { Publication } from "./publication";
import { publicationMediaFiles } from "./publication-media";

/** Server-owned signing key only. The manifest contains hashes, never draft
 * bodies or credentials. Identical snapshots produce identical signatures. */
export async function signPublication(
  publication: Publication,
  baseHead: string,
  privateKey: string,
): Promise<string> {
  try {
    if (
      !/^[a-f0-9]{40}$/.test(baseHead) ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(publication.id) ||
      !Number.isSafeInteger(publication.revision) ||
      publication.revision < 1 ||
      editorialRecordPath(publication.record) !== publication.path
    )
      throw new Error();
    const bytes = new TextEncoder().encode(publication.source);
    if (bytes.length > MAX_SOURCE_BYTES) throw new Error();
    const sha256 = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (value) => value.toString(16).padStart(2, "0"),
    ).join("");
    const payload = {
      version: 1,
      repository: "anipotts/anipotts.com",
      operationId: publication.id,
      revision: publication.revision,
      baseHead,
      files: [
        { path: publication.path, sha256 },
        ...publicationMediaFiles(publication).map(({ path, sha256 }) => ({
          path,
          sha256,
        })),
      ],
    };
    const pem = createPrivateKey(privateKey).export({
      type: "pkcs8",
      format: "pem",
    });
    const key = await importPKCS8(String(pem), "RS256");
    const envelope = await new FlattenedSign(
      new TextEncoder().encode(JSON.stringify(payload)),
    )
      .setProtectedHeader({ alg: "RS256", typ: "editorial-publication" })
      .sign(key);
    return JSON.stringify(envelope, null, 2) + "\n";
  } catch {
    throw new Error("publication_signing_failed");
  }
}
