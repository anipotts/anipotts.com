import { editorialRecordSchema } from "@anipotts/content/editorial/source";

/** A new document stays private until the existing publication review is approved. */
export function newWritingSource(title = "Untitled article"): string {
  return `---\ntitle: ${JSON.stringify(title.trim() || "Untitled article")}\nsummary: ""\nstatus: draft\ncontent_type: article\ntags: []\n---\n\n`;
}

export function writingId(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 120)
    .replace(/-$/u, "");
}

export function validWritingId(id: string): boolean {
  return editorialRecordSchema.safeParse({ kind: "writing", id }).success;
}
