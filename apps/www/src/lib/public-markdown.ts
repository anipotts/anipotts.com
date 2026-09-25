import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import GithubSlugger from "github-slugger";
import rehypeSanitize from "rehype-sanitize";

type Node = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};

const heading = /^h[1-6]$/;
const textOf = (nodes: Node[] = []): string =>
  nodes
    .map((node) =>
      node.type === "text"
        ? (node.value ?? "")
        : node.type === "element"
          ? textOf(node.children)
          : "",
    )
    .join("");

/** Heading ids as published articles have always carried them. Astro 6
 * stopped dropping a trailing hyphen (`## Code heading-` became
 * `code-heading-`), which would move existing anchors. Astro's own id pass
 * runs later and keeps an id that is already set. */
function publishedHeadingIds() {
  return (tree: Node) => {
    const slugger = new GithubSlugger();
    const visit = (nodes: Node[] = []) => {
      for (const node of nodes) {
        if (node.type !== "element") continue;
        node.properties ??= {};
        if (
          heading.test(node.tagName ?? "") &&
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
