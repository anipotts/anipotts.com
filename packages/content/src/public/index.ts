export {
  DEFAULT_CMS_PROJECTS,
  DEFAULT_CMS_WRITING,
  DEFAULT_HOMEPAGE_CONTENT,
  DEFAULT_WORK_INDEX_CONTENT,
  DEFAULT_NEWSLETTER_CONTENT,
  DEFAULT_NEWSLETTER_ARCHIVE_CONTENT,
  DEFAULT_SYSTEMS_CONTENT,
  DEFAULT_WRITING_INDEX_CONTENT,
  HOME_SECTION_ORDER,
  HOMEPAGE_FIELD_LIMITS,
  CMS_TEXT_LIMITS,
  PUBLIC_CONTENT_SOURCE_HASH,
} from "./defaults.js";
export {
  cmsProjectPageKey,
  cmsWritingPageKey,
  normalizeListingPageContent,
  normalizeCmsProject,
  normalizeCmsWriting,
  normalizeNewsletterContent,
  normalizeSystemsPageContent,
  validateListingPageContent,
  validateCmsProject,
  validateCmsWriting,
  validateNewsletterContent,
  validateSystemsPageContent,
} from "./editor.js";
export {
  homepageSummaryText,
  normalizeHomepageContent,
  segmentHomepageSummaryParagraph,
  validateHomepageContent,
} from "./homepage.js";
export type { HomepageInlineSummarySegment } from "./homepage.js";
export { parseMarkdownBlocks } from "./markdown.js";
export { analyzePublicCopy } from "./public-copy.js";

export type {
  CmsWritingContent,
  HomepageMention,
  HomepageRichSummarySegment,
  HomepageRichSummarySentence,
  HomepageRichSummarySimpleSegment,
  ListingBucketContent,
  ListingPageContent,
  SystemsPageContent,
  PublicCopyContext,
  PublicCopyFinding,
  PublicCopyRule,
} from "@anipotts/types";
export type { InlineSegment, MarkdownBlock } from "./markdown.js";
export {
  siteConfig,
  siteLinks,
  navItems,
  footerProfileDefaults,
  siteSettingsSchema,
  resolveSiteSettings,
} from "./site.js";
export type { SiteSettings } from "./site.js";
export { workflowProviders } from "./providers.js";
export { isPublicProject, isPublishedWriting } from "./visibility.js";
