import { publicContentContext } from "../lib/content";
import { inlinePlainText } from "@anipotts/content/public/inline";
import { publishedWriting, writingSlug } from "../lib/content";

export const prerender = false;

/** Final public serving artifact. Only explicitly published writing enters this file. */
export async function GET({ locals }: import("astro").APIContext) {
  const items = (await publishedWriting(publicContentContext(locals))).map(
    (entry) => ({
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
    }),
  );
  return Response.json(items);
}
