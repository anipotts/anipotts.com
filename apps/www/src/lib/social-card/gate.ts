import {
  getPublishedInventory,
  type PublishedSnapshot,
} from "@anipotts/content/editorial/direct-publication";
import { parseEditorialSource } from "@anipotts/content/editorial/source";
import { isPublishedWriting } from "@anipotts/content/public";
import { writingSchema } from "@anipotts/content/public/schema";
import { publicVersionHeaders } from "../published-runtime";

// Cards are painted at build time for the writing published then, so a card
// file can outlive its article. Under the content store the card is served
// only while the article it names is public at the current inventory.
const bundled = import.meta.glob("../../../../../content/public/writing/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const CARD = /^\/social\/writing-([a-z0-9]+(?:-[a-z0-9]+)*)\.png$/u;

/** The article slug a per-article card names, or null for any other path. */
export function writingCardSlug(pathname: string): string | null {
  return CARD.exec(pathname)?.[1] ?? null;
}

function publicSlug(id: string, source: string): string | null {
  try {
    const data = writingSchema.parse(parseEditorialSource(source).data);
    return isPublishedWriting(data) ? (data.slug ?? id) : null;
  } catch {
    return null;
  }
}

/** Public writing slugs at one inventory: bundled records overlaid by their
 * complete published records, then filtered for visibility, the same order
 * the listings use. */
export function publicWritingSlugs(
  publications: readonly PublishedSnapshot[],
): Set<string> {
  const sources = new Map<string, string>();
  for (const [path, source] of Object.entries(bundled)) {
    const id = /\/([^/]+)\.md$/u.exec(path)?.[1];
    if (id) sources.set(id, source);
  }
  for (const publication of publications)
    if (publication.record.kind === "writing")
      sources.set(publication.record.id, publication.source);
  const slugs = new Set<string>();
  for (const [id, source] of sources) {
    const slug = publicSlug(id, source);
    if (slug) slugs.add(slug);
  }
  return slugs;
}

/** A 404 for a card whose article is not public now, or null to serve it.
 * The 404 names the inventory it was decided at, like every CMS 404. */
export async function hiddenWritingCard(
  db: D1Database,
  slug: string,
): Promise<Response | null> {
  const { version, publications } = await getPublishedInventory(db);
  if (publicWritingSlugs(publications).has(slug)) return null;
  return new Response("Not found", {
    status: 404,
    headers: {
      ...publicVersionHeaders(version),
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
