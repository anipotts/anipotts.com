import GithubSlugger from "github-slugger";
import type { ElementContent, Root, RootContent } from "hast";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
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

// Astro's Markdown defaults for published articles (GFM, smart punctuation
// and heading ids) without the syntax highlighter, which a private preview
// never used and which was most of the Worker. Sanitizing runs before ids are
// added, so active HTML, scripts and event handlers never survive.
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkSmartypants)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeSanitize)
  .use(headingIds)
  .use(rehypeStringify);

export async function renderArticlePreview(body: string): Promise<string> {
  return String(await processor.process(body));
}
