import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import rehypeSanitize from "rehype-sanitize";
import { publishedHeadingIds } from "./published-heading-ids.mjs";

let processor: ReturnType<typeof createMarkdownProcessor> | undefined;

/** The public article renderer: Astro's remark/rehype Markdown defaults
 * without syntax highlighting, sanitized before ids are added. */
export async function publicMarkdownHtml(body: string): Promise<string> {
  processor ??= createMarkdownProcessor({
    syntaxHighlight: false,
    rehypePlugins: [rehypeSanitize, publishedHeadingIds],
  });
  return (await (await processor).render(body)).code;
}
