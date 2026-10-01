import GithubSlugger from "github-slugger";
import type { ElementContent, Root, RootContent } from "hast";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { safeAssetUrl } from "../public/urls.ts";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import remarkSmartypants from "remark-smartypants";
import { unified } from "unified";

const heading = /^h[1-6]$/;

function textOf(nodes: ElementContent[]): string {
  return nodes
    .map((node) =>
      node.type === "text"
        ? node.value
        : node.type === "element"
          ? textOf(node.children)
          : "",
    )
    .join("");
}

/** Heading ids exactly as Astro assigns them to published articles. */
function headingIds() {
  return (tree: Root) => {
    const slugger = new GithubSlugger();
    const visit = (nodes: (RootContent | ElementContent)[]) => {
      for (const node of nodes) {
        if (node.type !== "element") continue;
        if (
          heading.test(node.tagName) &&
          typeof node.properties.id !== "string"
        ) {
          const slug = slugger.slug(textOf(node.children));
          node.properties.id = slug.endsWith("-") ? slug.slice(0, -1) : slug;
        }
        visit(node.children);
      }
    };
    visit(tree.children);
  };
}

export type MarkdownOptions = { resolveMedia?: (source: string) => string };

/** A lightweight sanitized Markdown renderer shared by publication and preview.
 * The exact candidate body is rendered without a content-loader lookup. */
export async function renderEditorialMarkdown(
  body: string,
  options: MarkdownOptions = {},
): Promise<string> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkSmartypants)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSanitize)
    .use(headingIds);
  if (options.resolveMedia) {
    const resolve = options.resolveMedia;
    processor.use(() => (tree: Root) => {
      const visit = (nodes: (RootContent | ElementContent)[]) => {
        for (const node of nodes) {
          if (node.type !== "element") continue;
          if (
            node.tagName === "img" &&
            typeof node.properties.src === "string"
          ) {
            const resolved = resolve(node.properties.src);
            if (safeAssetUrl(resolved)) node.properties.src = resolved;
            else delete node.properties.src;
          }
          visit(node.children);
        }
      };
      visit(tree.children);
    });
  }
  return String(await processor.use(rehypeStringify).process(body));
}
