export const editorialMediaId = /^[a-f0-9]{64}\.(?:jpg|png|webp)$/u;
export const editorialMediaPrefix = "/images/editorial/";
export const editorialMediaGitPrefix = "apps/www/public/images/editorial/";
export const MAX_PUBLICATION_MEDIA_BYTES = 10 * 1024 * 1024;
export const MAX_PUBLICATION_IMAGES = 10;

export function referencedMediaIds(source: string): string[] {
  return [
    ...new Set(
      Array.from(
        source.matchAll(
          /\/images\/editorial\/([a-f0-9]{64}\.(?:jpg|png|webp))/gu,
        ),
        (match) => match[1]!,
      ),
    ),
  ].sort();
}

export function editorialImagePreview(src: string): string {
  const id = src.startsWith(editorialMediaPrefix)
    ? src.slice(editorialMediaPrefix.length)
    : "";
  return editorialMediaId.test(id) ? `/api/editorial/media?id=${id}` : src;
}

/** Normalize images copied from the private editor without leaking its API URL. */
export function editorialImageSource(src: string): string {
  try {
    const url = new URL(src, "https://admin.anipotts.com");
    const trusted =
      url.hostname === "admin.anipotts.com" ||
      url.hostname === "localhost" ||
      url.hostname === "admin.anipotts.localhost";
    const id = url.searchParams.get("id") ?? "";
    if (
      trusted &&
      url.pathname === "/api/editorial/media" &&
      editorialMediaId.test(id)
    )
      return editorialMediaPrefix + id;
  } catch {
    /* Leave other image sources for normal URL validation. */
  }
  return src;
}
