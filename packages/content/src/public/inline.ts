import { Lexer, type Token } from "marked";

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "break" }
  | { type: "image"; src: string; alt: string; title?: string }
  | {
      type: "strong" | "em" | "u" | "del" | "code" | "a";
      children: InlineNode[];
      href?: string;
    };

/** A closed inline vocabulary shared by the editor, previews, and public pages.
 * Raw HTML is text except paired <u> tags. Never execute author-supplied HTML.
 */
export function safeInlineUrl(value: string, image = false): boolean {
  if (!value || /[\u0000-\u0020\u007f\\<>"']/u.test(value)) return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  if (!image && /^#[\w-]+$/u.test(value)) return true;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function nodes(tokens: Token[]): InlineNode[] {
  const result: InlineNode[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type === "html" && token.raw === "<u>") {
      const end = tokens.findIndex(
        (candidate, j) =>
          j > i && candidate.type === "html" && candidate.raw === "</u>",
      );
      if (end > i) {
        result.push({ type: "u", children: nodes(tokens.slice(i + 1, end)) });
        i = end;
        continue;
      }
    }
    switch (token.type) {
      case "strong":
      case "em":
      case "del":
        result.push({ type: token.type, children: nodes(token.tokens ?? []) });
        break;
      case "codespan":
        result.push({
          type: "code",
          children: [{ type: "text", text: token.text }],
        });
        break;
      case "link":
        result.push(
          ...(safeInlineUrl(token.href)
            ? [
                {
                  type: "a" as const,
                  href: token.href,
                  children: nodes(token.tokens ?? []),
                },
              ]
            : nodes(token.tokens ?? [])),
        );
        break;
      case "image":
        result.push(
          safeInlineUrl(token.href, true)
            ? {
                type: "image",
                src: token.href,
                alt: token.text,
                title: token.title ?? undefined,
              }
            : { type: "text", text: token.text },
        );
        break;
      case "br":
        result.push({ type: "break" });
        break;
      case "escape":
      case "text":
        result.push({ type: "text", text: token.text });
        break;
      default:
        result.push({ type: "text", text: token.raw });
    }
  }
  return result;
}
export function parseInline(value: string): InlineNode[] {
  return nodes(Lexer.lexInline(value, { gfm: true, breaks: true }));
}
const escape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
export function inlineImageClass(title?: string) {
  return [
    "inline-image",
    ...(title
      ?.split(" ")
      .filter((part) => ["white", "wide", "mark"].includes(part))
      .map((part) => `inline-image-${part}`) ?? []),
  ].join(" ");
}
export function inlineHtml(value: string, links = true): string {
  const render = (parts: InlineNode[]): string =>
    parts
      .map((part) => {
        if (part.type === "text") return escape(part.text);
        if (part.type === "break") return "<br>";
        if (part.type === "image")
          return `<img class="${inlineImageClass(part.title)}" src="${escape(part.src)}" alt="${escape(part.alt)}" loading="lazy" decoding="async">`;
        const content = render(part.children);
        if (part.type === "a")
          return links
            ? `<a href="${escape(part.href!)}">${content}</a>`
            : content;
        return `<${part.type}>${content}</${part.type}>`;
      })
      .join("");
  // Keep each logo with the next word, especially the compact YC batch badge.
  return render(parseInline(value)).replace(
    /(<img [^>]*>)([\p{L}\p{N}][^\s<]*)/gu,
    '<span class="inline-image-run">$1$2</span>',
  );
}
export function inlinePlainText(value: string): string {
  const plain = (parts: InlineNode[]): string =>
    parts
      .map((part) =>
        part.type === "text"
          ? part.text
          : part.type === "break"
            ? " "
            : part.type === "image"
              ? part.alt
                ? `${part.alt} `
                : ""
              : plain(part.children),
      )
      .join("");
  return plain(parseInline(value)).replace(/\s+/g, " ").trim();
}
export function escapeInlineText(value: string) {
  return value.replace(/([\\`*_\[\]<>~])/g, "\\$1");
}
