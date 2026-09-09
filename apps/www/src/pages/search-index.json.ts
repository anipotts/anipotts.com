import { inlinePlainText } from "@anipotts/content/public/inline";
import { getCollection, getEntry } from "astro:content";
import { validateContentReferences } from "@anipotts/content/public/references";
import { publishedWriting, writingSlug } from "../lib/content";

export const prerender = true;

/** Final public serving artifact. Only explicitly published writing enters this file. */
export async function GET() {
  const home = await getEntry("home", "home");
  if (!home) throw new Error("Missing canonical homepage content");
  validateContentReferences(
    await getCollection("projects"),
    await getCollection("writing"),
    home.data.sections.latest_thoughts.writing_slugs ?? [],
  );
  const items = (await publishedWriting()).map((entry) => ({
    slug: writingSlug(entry),
    title: entry.data.title,
    summary: inlinePlainText(entry.data.summary),
    date: entry.data.published_at?.toISOString() ?? null,
    text: [
      entry.data.title,
      inlinePlainText(entry.data.summary),
      entry.body ?? "",
    ]
      .join(" ")
      .toLowerCase(),
  }));
  return Response.json(items);
}
