import GithubSlugger from "github-slugger";

const heading = /^h[1-6]$/;
/** @param {any[]} [nodes] @returns {string} */
const textOf = (nodes = []) =>
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
 * runs later and keeps an id that is already set. Used by the CMS renderer
 * (lib/public-markdown.ts) and by `markdown.processor` in both astro configs,
 * so Git-rendered entries match. */
export function publishedHeadingIds() {
  /** @param {any} tree */
  return (tree) => {
    const slugger = new GithubSlugger();
    /** @param {any[]} [nodes] */
    const visit = (nodes = []) => {
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
