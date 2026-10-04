import { editorialImagePreview } from "./editorial-media";

export type PreviewMediaContext = {
  requestUrl: URL;
  publicSiteUrl: string;
  localAssets?: boolean;
};
const assetPath = /^\/(?:images|media|fonts|brand)\//u;
/** Pure preview resolution. Uploaded candidate media stays on the owner API;
 * retained site assets and every responsive variant use the same asset origin. */
export function previewMediaUrl(
  source: string,
  context: PreviewMediaContext,
): string {
  const path = source.replaceAll("&amp;", "&");
  let uploadedPath = path;
  try {
    const url = new URL(path, context.requestUrl);
    if (
      [
        context.requestUrl.origin,
        new URL(context.publicSiteUrl).origin,
      ].includes(url.origin)
    )
      uploadedPath = url.pathname;
  } catch {
    /* Authored source validation owns invalid URLs. */
  }
  const privatePath = editorialImagePreview(uploadedPath);
  if (privatePath !== uploadedPath)
    return new URL(privatePath, context.requestUrl).href;
  if (path.startsWith("/api/editorial/media"))
    return new URL(path, context.requestUrl).href;
  if (!assetPath.test(path)) return path;
  return new URL(
    path,
    context.localAssets ? context.requestUrl : context.publicSiteUrl,
  ).href;
}
export function previewMediaSrcset(
  value: string,
  context: PreviewMediaContext,
): string {
  return value
    .split(/\s*,\s*/u)
    .map((candidate) => {
      const match = /^(.*?)(\s+\d+(?:\.\d+)?[wx])?$/u.exec(candidate.trim());
      return match
        ? previewMediaUrl(match[1]!, context) + (match[2] ?? "")
        : candidate;
    })
    .join(", ");
}
