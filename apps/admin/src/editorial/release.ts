import { createHash } from "node:crypto";
import { parseEditorialSource } from "@anipotts/content/editorial/source";
import { EditorialGitHub, GitHubFailure } from "./github";
import type { Publication } from "./publication";
import type { ReleaseReadiness } from "./publication-stage";

import {
  editorialMediaGitPrefix,
  editorialMediaId,
  editorialMediaPrefix,
  referencedMediaIds,
  MAX_PUBLICATION_MEDIA_BYTES,
} from "../lib/editorial-media";

const sha = /^[a-f0-9]{40}$/;
const origin = "https://anipotts.com";
const isNonRuntimeChange = (path: string) =>
  path.startsWith("docs/") ||
  path.endsWith(".test.ts") ||
  path.endsWith(".test.mjs");

export async function liveRelease(
  transport: typeof fetch = fetch,
): Promise<string> {
  let response: Response;
  try {
    response = await transport(`${origin}/api/health`, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: { "Cache-Control": "no-cache" },
    });
  } catch {
    throw new GitHubFailure("unavailable");
  }
  if (!response.ok || !response.body) throw new GitHubFailure("unavailable");
  const reader = response.body.getReader();
  let size = 0,
    text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new Error();
      }
      text += decoder.decode(part.value, { stream: true });
    }
    const value = JSON.parse(text + decoder.decode());
    if (
      value.app !== "www" ||
      value.ok !== true ||
      typeof value.release_sha !== "string" ||
      !sha.test(value.release_sha)
    )
      throw new Error();
    return value.release_sha;
  } catch {
    throw new GitHubFailure("invalid_response");
  } finally {
    reader.releaseLock();
  }
}

export function releaseReadiness(
  git: Pick<EditorialGitHub, "compare">,
  adminRelease: string,
  transport: typeof fetch = fetch,
): ReleaseReadiness {
  return async (head) => {
    if (!sha.test(adminRelease))
      return { ready: false, code: "stale_renderer" };
    const changes = await git.compare(adminRelease, head);
    // Every executable/configuration change requires the matching admin release.
    if (
      changes.some(
        (path) =>
          !path.startsWith("content/public/") &&
          !(
            path.startsWith(editorialMediaGitPrefix) &&
            editorialMediaId.test(path.slice(editorialMediaGitPrefix.length))
          ) &&
          path !== "content/publication.json" &&
          !isNonRuntimeChange(path),
      )
    )
      return { ready: false, code: "stale_renderer" };
    const live = await liveRelease(transport);
    if (live !== head) {
      const unreleased = await git.compare(live, head);
      // Even unrelated public edits must not be silently swept into Publish.
      // Admin-only releases do not deploy www. The renderer check above still
      // requires that these changes are already running in this admin Worker.
      if (
        unreleased.some(
          (path) =>
            !isNonRuntimeChange(path) && !path.startsWith("apps/admin/"),
        )
      )
        return { ready: false, code: "unreleased_public_changes" };
    }
    return { ready: true, head };
  };
}

/** Match deployed ancestry, exact Git source bytes and the affected public route.
 * An intervening release is accepted only if the authorized content is intact.
 */
export async function verifyPublishedContent(
  publication: Publication,
  merge: string,
  git: Pick<EditorialGitHub, "compare" | "readBase">,
  transport: typeof fetch = fetch,
): Promise<boolean> {
  const live = await liveRelease(transport);
  await git.compare(merge, live);
  const base = await git.readBase(publication.record, live);
  const bytes = Buffer.from(publication.source);
  const fileHash = createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
  if (
    base.head !== live ||
    base.file?.sha !== fileHash ||
    base.file.mode !== "100644" ||
    base.file.type !== "blob"
  )
    return false;
  const data = parseEditorialSource(publication.source).data as Record<
    string,
    unknown
  >;
  const slug = data.slug ?? publication.record.id;
  if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    return false;
  const path =
    publication.record.kind === "page"
      ? publication.record.id === "home"
        ? "/"
        : `/${publication.record.id}`
      : `/${publication.record.kind}/${slug}`;
  const hidden =
    publication.record.kind === "work"
      ? data.public_state === "hidden"
      : publication.record.kind === "writing"
        ? data.status !== "published"
        : publication.record.id === "newsletter" && data.status !== "published";
  const response = await transport(`${origin}${path}`, {
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  await response.body?.cancel();
  if (response.status !== (hidden ? 404 : 200)) return false;
  let mediaBytes = 0;
  for (const id of referencedMediaIds(publication.source)) {
    const image = await transport(`${origin}${editorialMediaPrefix}${id}`, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const expectedType = id.endsWith(".jpg")
      ? "image/jpeg"
      : id.endsWith(".png")
        ? "image/png"
        : "image/webp";
    if (
      !image.ok ||
      !image.body ||
      image.headers.get("Content-Type")?.split(";")[0] !== expectedType
    ) {
      await image.body?.cancel();
      return false;
    }
    const reader = image.body.getReader();
    const digest = createHash("sha256");
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        mediaBytes += part.value.byteLength;
        if (mediaBytes > MAX_PUBLICATION_MEDIA_BYTES) {
          await reader.cancel();
          return false;
        }
        digest.update(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    if (digest.digest("hex") !== id.split(".")[0]) return false;
  }
  return (await liveRelease(transport)) === live;
}
