import { safeContactLinkUrl } from "./urls.js";

export type InlineSegment =
  | { kind: "text"; text: string }
  | { kind: "em"; text: string }
  | { kind: "link"; text: string; href: string };

export type MarkdownBlock =
  | { kind: "heading"; level: 2 | 3; segments: InlineSegment[] }
  | { kind: "paragraph"; segments: InlineSegment[] }
  | { kind: "list"; items: InlineSegment[][] };

export function parseMarkdownBlocks(raw: string): MarkdownBlock[] {
  return raw
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(parseBlock);
}

function parseBlock(block: string): MarkdownBlock {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const first = lines[0] ?? "";
  const heading = first.match(/^(#{2,3})\s+(.+)$/);

  if (heading?.[1] && heading[2] && lines.length === 1) {
    return {
      kind: "heading",
      level: heading[1].length as 2 | 3,
      segments: parseInline(heading[2]),
    };
  }

  if (lines.length > 0 && lines.every((line) => line.startsWith("- "))) {
    return {
      kind: "list",
      items: lines.map((line) => parseInline(line.slice(2).trim())),
    };
  }

  return {
    kind: "paragraph",
    segments: parseInline(lines.join(" ")),
  };
}

function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|_([^_]+)_/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "text", text: text.slice(lastIndex, match.index) });
    }

    if (match[1] && match[2]) {
      const href = match[2].trim();
      if (safeContactLinkUrl(href)) {
        segments.push({ kind: "link", text: match[1], href });
      } else {
        segments.push({ kind: "text", text: `${match[1]} (${href})` });
      }
    } else if (match[3]) {
      segments.push({ kind: "em", text: match[3] });
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ kind: "text", text: text.slice(lastIndex) });
  }

  return segments;
}
