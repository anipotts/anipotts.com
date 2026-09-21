import {
  getPublishedInventory,
  type PublishedSnapshot,
} from "@anipotts/content/editorial/direct-publication";
import { CONTENT_SCHEMA_VERSION } from "@anipotts/content/editorial/publication-contract";
import {
  parseEditorialSource,
  type EditorialRecord,
} from "@anipotts/content/editorial/source";
import { projectSchema, writingSchema } from "@anipotts/content/public/schema";
import { isPublicProject, isPublishedWriting } from "@anipotts/content/public";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import rehypeSanitize from "rehype-sanitize";
import { usesPublishedContent } from "./content-runtime-mode";

export type PublishedInventory = Awaited<
  ReturnType<typeof getPublishedInventory>
>;
export type PublicContentContext = {
  cms: boolean;
  inventory: Promise<PublishedInventory>;
  parsed: Map<string, ReturnType<typeof parseEditorialSource>>;
  rendered: Map<string, Promise<string>>;
};
const requests = new WeakMap<object, PublicContentContext>();
export function publicContentContext(locals: App.Locals): PublicContentContext {
  let context = requests.get(locals);
  if (!context) {
    const env = locals.runtime?.env;
    const cms = usesPublishedContent(env);
    context = {
      cms,
      inventory: cms
        ? env?.CONTENT_RUNTIME !== "cms"
          ? Promise.reject(new Error("content_runtime_mode_invalid"))
          : env?.CONTENT_DB
            ? getPublishedInventory(env.CONTENT_DB)
            : Promise.reject(new Error("content_database_unavailable"))
        : Promise.resolve({ version: 0, publications: [] }),
      parsed: new Map(),
      rendered: new Map(),
    };
    requests.set(locals, context);
  }
  return context;
}

export function publicationData(
  context: PublicContentContext,
  publication: PublishedSnapshot,
) {
  let parsed = context.parsed.get(publication.publicationId);
  if (!parsed) {
    parsed = parseEditorialSource(publication.source);
    context.parsed.set(publication.publicationId, parsed);
  }
  return parsed;
}

export function publicationIsVisible(
  context: PublicContentContext,
  publication: PublishedSnapshot,
): boolean {
  const data = publicationData(context, publication).data;
  if (publication.record.kind === "writing")
    return isPublishedWriting(writingSchema.parse(data));
  if (publication.record.kind === "work")
    return isPublicProject(projectSchema.parse(data));
  return publication.record.id !== "newsletter";
}

/** Overlay complete editable records before filtering public visibility. */
export function overlayByIdentity<T extends { id: string }>(
  base: T[],
  overrides: T[],
): T[] {
  const entries = new Map(base.map((entry) => [entry.id, entry]));
  for (const entry of overrides) entries.set(entry.id, entry);
  return [...entries.values()];
}
let processor: ReturnType<typeof createMarkdownProcessor> | undefined;
export function publicationHtml(
  context: PublicContentContext,
  publication: PublishedSnapshot,
): Promise<string> {
  let rendered = context.rendered.get(publication.publicationId);
  if (!rendered) {
    rendered = publicMarkdownHtml(publicationData(context, publication).body);
    context.rendered.set(publication.publicationId, rendered);
  }
  return rendered;
}
export async function publicMarkdownHtml(body: string): Promise<string> {
  processor ??= createMarkdownProcessor({
    syntaxHighlight: false,
    rehypePlugins: [rehypeSanitize],
  });
  return (await (await processor).render(body)).code;
}
export async function publicationFor(
  context: PublicContentContext,
  record: EditorialRecord,
) {
  return (await context.inventory).publications.find(
    (item) => item.record.kind === record.kind && item.record.id === record.id,
  );
}
export function publicVersionHeaders(version: number) {
  return {
    "Cache-Control": "no-store",
    "CDN-Cache-Control": "no-store",
    "Cloudflare-CDN-Cache-Control": "no-store",
    "X-Content-Version": String(version),
    "X-Content-Schema": String(CONTENT_SCHEMA_VERSION),
  };
}
export function contentUnavailable() {
  return new Response("Content unavailable", {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
      "Retry-After": "30",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
