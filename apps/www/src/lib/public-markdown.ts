import { renderEditorialMarkdown } from "@anipotts/content/editorial/markdown";

/** Published bodies and private candidate previews share one sanitized renderer. */
export const publicMarkdownHtml = renderEditorialMarkdown;
