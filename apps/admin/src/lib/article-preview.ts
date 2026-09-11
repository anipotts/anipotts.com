import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import rehypeSanitize from "rehype-sanitize";

// The same Astro Markdown engine used by published articles, with active HTML
// removed for private previews. Scripts and event handlers never execute.
const processor = createMarkdownProcessor({
  syntaxHighlight: false,
  rehypePlugins: [rehypeSanitize],
});
export async function renderArticlePreview(body: string): Promise<string> {
  return (await (await processor).render(body)).code;
}
