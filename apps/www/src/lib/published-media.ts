import {
  publicMarkdownHtml,
  publicationFor,
  type PublicContentContext,
} from "./published-runtime";
import { publishedWriting, visibleProjects, publicPage } from "./content";
export const publicMediaId = /^[a-f0-9]{64}\.(?:jpg|png|webp)$/u;

/** Resolve references from the active public projection, never private history
 * or an overridden Git record. Parse Markdown before inspecting image URLs. */
export async function publicMediaReference(
  context: PublicContentContext,
  id: string,
): Promise<"cms" | "bundled" | null> {
  if (!publicMediaId.test(id)) return null;
  const path = `/images/editorial/${id}`;
  const structuredReference = (value: unknown): boolean => {
    if (typeof value === "string") return value === path;
    if (Array.isArray(value)) return value.some(structuredReference);
    return Boolean(
      value &&
      typeof value === "object" &&
      Object.values(value).some(structuredReference),
    );
  };
  for (const entry of [
    ...(await publishedWriting(context)),
    ...(await visibleProjects(context)),
  ]) {
    const html = await publicMarkdownHtml(entry.body ?? "");
    if (
      structuredReference(entry.data) ||
      [...html.matchAll(/\b(?:src|href)="([^"]+)"/gu)].some(
        (match) => match[1] === path,
      )
    )
      return entry.publication ? "cms" : "bundled";
  }
  for (const page of ["home", "work", "writing", "systems"] as const) {
    if (structuredReference(await publicPage(page, context)))
      return (await publicationFor(context, { kind: "page", id: page }))
        ? "cms"
        : "bundled";
  }
  return null;
}
