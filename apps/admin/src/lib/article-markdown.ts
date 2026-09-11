import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { MarkdownManager } from "@tiptap/markdown";
import { safeInlineUrl } from "@anipotts/content/public/inline";
import { editorialImagePreview, editorialImageSource } from "./editorial-media";

const ArticleImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (element) =>
          editorialImageSource(element.getAttribute("src") ?? ""),
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "img",
      {
        ...HTMLAttributes,
        src: editorialImagePreview(String(HTMLAttributes.src ?? "")),
      },
    ];
  },
});

export function articleExtensions() {
  return [
    StarterKit.configure({
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
        isAllowedUri: (url) => safeInlineUrl(url),
      },
    }),
    ArticleImage.configure({ allowBase64: false }),
  ];
}

const markdown = new MarkdownManager({ extensions: articleExtensions() });

/** Preserve syntax that the visual editor cannot faithfully round-trip. */
export function needsMarkdownEditor(value: string): boolean {
  // HTML and reference definitions also carry author-controlled representation.
  if (/^\s*\[[^\]]+\]:|\[\^/mu.test(value)) return true;
  try {
    let html = false;
    markdown.instance.walkTokens(markdown.instance.lexer(value), (token) => {
      if (token.type === "html") html = true;
    });
    if (html) return true;
    const roundTrip = markdown.serialize(markdown.parse(value));
    return (
      markdown.instance.parse(value) !== markdown.instance.parse(roundTrip)
    );
  } catch {
    return true;
  }
}

export function articleMarkdownRoundTrip(value: string) {
  return markdown.serialize(markdown.parse(value));
}
