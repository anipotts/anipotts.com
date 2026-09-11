import { parseEditorialSource } from "@anipotts/content/editorial/source";
import type { Draft } from "../editorial/draft-store";
import type { CatalogRecord } from "../components/astryx/EditorialApp";

export function privateWritingRecords(drafts: Draft[]): CatalogRecord[] {
  return drafts.map((draft) => {
    const id = draft.key.split("/").at(-1)!.replace(/\.md$/u, "");
    let title = id;
    let summary = "";
    try {
      const parsed = parseEditorialSource(draft.source).data as Record<
        string,
        unknown
      >;
      if (typeof parsed.title === "string" && parsed.title.trim())
        title = parsed.title;
      if (typeof parsed.summary === "string") summary = parsed.summary;
    } catch {
      /* Invalid intermediate drafts must remain discoverable. */
    }
    return {
      title,
      summary,
      section: "writing",
      status: "draft",
      href: `/content/writing/${id}`,
      updated: {
        at: new Date(draft.updatedAt).toISOString(),
        source: "private",
      },
    };
  });
}
