import { editorialRecordSchema } from "@anipotts/content/editorial/source";
import { bundledPublicationSourceHash } from "@anipotts/content/editorial/publication-contract";

const sources = import.meta.glob("../../../../content/public/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
let digest: Promise<string> | undefined;
/** Exact defaults, including currently hidden records, must match the writer's
 * baseline. Release IDs may differ when only application code has changed. */
export function bundledEditorialSourceHash(): Promise<string> {
  digest ??= bundledPublicationSourceHash(
    Object.entries(sources).flatMap(([path, source]) => {
      const match = /\/public\/(pages|projects|writing)\/([^/]+)\.md$/.exec(
        path,
      );
      if (!match) return [];
      const record = editorialRecordSchema.safeParse({
        kind:
          match[1] === "pages"
            ? "page"
            : match[1] === "projects"
              ? "work"
              : "writing",
        id: match[2],
      });
      return record.success ? [{ record: record.data, source }] : [];
    }),
  );
  return digest;
}
