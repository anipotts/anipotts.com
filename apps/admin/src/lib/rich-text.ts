import type { JSONContent } from "@tiptap/react";
import {
  parseInline,
  escapeInlineText,
  type InlineNode,
} from "@anipotts/content/public/inline";
import {
  segmentHomepageSummaryParagraph,
  type HomepageMention,
} from "@anipotts/content/public";

const markNames = {
  strong: "bold",
  em: "italic",
  u: "underline",
  del: "strike",
  code: "code",
  a: "link",
};
export function inlineDocument(value: string): JSONContent {
  const convert = (
    parts: InlineNode[],
    marks: NonNullable<JSONContent["marks"]> = [],
  ): JSONContent[] =>
    parts.flatMap((part): JSONContent[] => {
      if (part.type === "text")
        return part.text ? [{ type: "text", text: part.text, marks }] : [];
      if (part.type === "break") return [{ type: "hardBreak" }];
      if (part.type === "image")
        return [
          {
            type: "image",
            attrs: { src: part.src, alt: part.alt, title: part.title ?? null },
            marks,
          },
        ];
      return convert(part.children, [
        ...marks,
        {
          type: markNames[part.type],
          ...(part.type === "a" ? { attrs: { href: part.href } } : {}),
        },
      ]);
    });
  return {
    type: "doc",
    content: [{ type: "paragraph", content: convert(parseInline(value)) }],
  };
}

/** Group adjacent marks before serializing, so edits inside a link retain one URL. */
export function inlineMarkdown(doc: JSONContent): string {
  const render = (parts: JSONContent[]): string => {
    let output = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const marks = [...(part.marks ?? [])].sort((a, b) =>
        a.type === "link"
          ? -1
          : b.type === "link"
            ? 1
            : a.type.localeCompare(b.type),
      );
      if (marks.length) {
        const mark = marks[0]!;
        const key = JSON.stringify(mark);
        const group: JSONContent[] = [];
        let j = i;
        for (; j < parts.length; j++) {
          const item = parts[j]!;
          if (
            !item.marks?.some((candidate) => JSON.stringify(candidate) === key)
          )
            break;
          group.push({
            ...item,
            marks: item.marks.filter(
              (candidate) => JSON.stringify(candidate) !== key,
            ),
          });
        }
        if (mark.type === "code") {
          const raw = group.map((node) => node.text ?? "").join("");
          const fence = "`".repeat(
            Math.max(0, ...(raw.match(/`+/g) ?? []).map((run) => run.length)) +
              1,
          );
          const padded =
            raw.startsWith("`") ||
            raw.endsWith("`") ||
            (/^ .+ $/u.test(raw) && raw.trim())
              ? ` ${raw} `
              : raw;
          output += fence + padded + fence;
          i = j - 1;
          continue;
        }
        const text = render(group);
        const leading = /^\s*/u.exec(text)![0];
        const trailing = /\s*$/u.exec(text)![0];
        const inner = text.trim();
        const wrap = {
          bold: ["**", "**"],
          italic: ["*", "*"],
          underline: ["<u>", "</u>"],
          strike: ["~~", "~~"],
          code: ["`", "`"],
        }[mark.type];
        output +=
          mark.type === "link"
            ? `[${text}](<${mark.attrs?.href}>)`
            : wrap
              ? inner
                ? leading + wrap[0] + inner + wrap[1] + trailing
                : text
              : text;
        i = j - 1;
      } else if (part.type === "text")
        output += escapeInlineText(part.text ?? "");
      else if (part.type === "hardBreak") output += "  \n";
      else if (part.type === "image")
        output += `![${escapeInlineText(part.attrs?.alt ?? "")}](${part.attrs?.src ? `<${part.attrs.src}>` : ""}${part.attrs?.title ? ` "${String(part.attrs.title).replace(/["\\]/g, "")}"` : ""})`;
      else output += render(part.content ?? []);
    }
    return output;
  };
  return (doc.content ?? [])
    .map((paragraph) => render(paragraph.content ?? []))
    .join("  \n");
}

/** Read old homepage prose once; all subsequent edits store explicit links and images. */
export function editableHomeSummary(
  text: string,
  keys: string[],
  mentions: Record<string, HomepageMention>,
  explicit = false,
) {
  if (explicit || /!?\[[^\]]*\]\(/u.test(text)) return text;
  return segmentHomepageSummaryParagraph(text, keys, mentions)
    .map((part) => {
      if (part.kind === "text") return escapeInlineText(part.text);
      const mention = mentions[part.key]!;
      const image = mention.logoSrc
        ? `![${mention.visualLabel ? escapeInlineText(mention.logoAlt ?? "") : ""}](${mention.logoSrc}${mention.logoTone === "white" || ["wide", "mark"].includes(mention.logoShape ?? "") ? ` "${[mention.logoTone === "white" ? "white" : "", ["wide", "mark"].includes(mention.logoShape ?? "") ? mention.logoShape : ""].filter(Boolean).join(" ")}"` : ""})`
        : "";
      const label = mention.visualLabel
        ? `${mention.visualPrefix ?? ""}${image}${escapeInlineText(mention.visualLabel)}${mention.visualSuffix ?? ""}`
        : image + escapeInlineText(part.text);
      return (
        (mention.href ? `[${label}](${mention.href})` : label) +
        (part.suffix ?? "")
      );
    })
    .join("");
}
