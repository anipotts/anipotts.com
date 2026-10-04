import { renderEditorialMarkdown } from "@anipotts/content/editorial/markdown";

/** Public and exact candidate bodies share the same sanitized Markdown contract. */
export const renderArticlePreview = renderEditorialMarkdown;
