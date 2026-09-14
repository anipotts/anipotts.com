import {
  listPublished,
  type PublishedSnapshot,
} from "@anipotts/content/editorial/direct-publication";
import { parseEditorialSource } from "@anipotts/content/editorial/source";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import rehypeSanitize from "rehype-sanitize";

export type PublicContentContext = {
  publications: Promise<PublishedSnapshot[]>;
};
const requests = new WeakMap<object, PublicContentContext>();
export function publicContentContext(locals: App.Locals): PublicContentContext {
  let context = requests.get(locals);
  if (!context) {
    const db = locals.runtime?.env?.CONTENT_DB;
    context = { publications: db ? listPublished(db) : Promise.resolve([]) };
    requests.set(locals, context);
  }
  return context;
}

/** Overlay before visibility filtering: a hidden publication suppresses its Git version. */
export function overlayByIdentity<T extends { id: string }>(
  base: T[],
  overrides: T[],
): T[] {
  const entries = new Map(base.map((entry) => [entry.id, entry]));
  for (const entry of overrides) entries.set(entry.id, entry);
  return [...entries.values()];
}

let processor: ReturnType<typeof createMarkdownProcessor> | undefined;
export async function publicMarkdown(source: string) {
  const parsed = parseEditorialSource(source);
  processor ??= createMarkdownProcessor({
    syntaxHighlight: false,
    rehypePlugins: [rehypeSanitize],
  });
  return {
    data: parsed.data,
    body: parsed.body,
    rendered: { html: (await (await processor).render(parsed.body)).code },
  };
}

/** Content routes must reach the runtime even when an old deployment contains static HTML. */
export function isRuntimeContentPath(pathname: string): boolean {
  return (
    /^\/(?:work(?:\/[^/]+)?|writing(?:\/[^/]+)?|systems|feed\.xml|sitemap\.xml|search-index\.json)?\/?$/u.test(
      pathname,
    ) || pathname.startsWith("/images/editorial/")
  );
}
