// ---------------------------------------------------------------------------
// Homepage content schema
// ---------------------------------------------------------------------------

export interface HomepageSection {
  visible: boolean;
  label: string;
  heading: string;
  subheading?: string;
  rich_summary?: HomepageRichSummarySentence[];
  mention_keys?: string[];
  paragraphs?: string[];
  links?: { label: string; href: string }[];
  limit?: number;
  view_all?: string;
  writing_slugs?: string[];
}

export type HomepageRichSummarySimpleSegment =
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "mention";
      key: string;
      suffix?: string;
    };

export type HomepageRichSummarySegment =
  | HomepageRichSummarySimpleSegment
  | {
      kind: "cluster";
      segments: HomepageRichSummarySegment[];
    }
  | {
      kind: "parens";
      segments: HomepageRichSummarySimpleSegment[];
    };

export interface HomepageRichSummarySentence {
  segments: HomepageRichSummarySegment[];
}

export interface HomepageMention {
  label: string;
  href?: string;
  icon?: string;
  mark?: string;
  logoSrc?: string;
  logoAlt?: string;
  logoTone?: "native" | "white";
  logoShape?: "square" | "wide" | "mark" | "large";
  badgeSrc?: string;
  badgeAlt?: string;
  visualLabel?: string;
  visualPrefix?: string;
  visualSuffix?: string;
  presentation?: "brand" | "facet";
}

export interface HomepageContent {
  sections: {
    intro: HomepageSection;
    about?: HomepageSection;
    past_work: HomepageSection;
    latest_thoughts: HomepageSection;
  };
  section_order: ("intro" | "past_work" | "latest_thoughts")[];
  mentions: Record<string, HomepageMention>;
}

// ---------------------------------------------------------------------------
// Owner editor schemas
// ---------------------------------------------------------------------------

export interface CmsEditorLink {
  label: string;
  url: string;
}

export interface CmsProjectMedia {
  kind: "image" | "gif" | "video";
  src: string;
  alt: string;
  caption?: string;
  fit?: "cover" | "contain";
}

export interface CmsProjectStorySection {
  title: string;
  paragraphs: string[];
  media?: CmsProjectMedia;
}

export interface CmsProjectContent {
  id?: string;
  slug: string;
  title: string;
  status: "live" | "wip" | "archived";
  year: string;
  range: string;
  tags: string[];
  summary: string;
  body: string;
  links: CmsEditorLink[];
  order: number;
  kind: "experience" | "project";
  public_state: "featured" | "listed" | "hidden";
  homepage_placement: "experience" | "work" | "none";
  catalog_group: "active" | "past" | "taken_down";
  homepage_order: number;
  card_copy: string;
  detail_path: string;
  identity: {
    logo_src?: string;
    logo_alt?: string;
    logo_tone?: "default" | "light" | "adaptive";
    icon?: string;
  };
  preview_media: CmsProjectMedia | null;
  story: CmsProjectStorySection[];
  updated_at?: string | null;
}

export interface CmsWritingContent {
  id?: string;
  slug: string;
  title: string;
  date: string;
  tags: string[];
  preview: string;
  body: string;
  sourceLinks: CmsEditorLink[];
  visible: boolean;
  order: number;
  updated_at?: string | null;
}

export interface NewsletterContent {
  headline: string;
  deck: string;
  cta_label: string;
  success_message: string;
  error_message: string;
  footer_text: string;
  buttondown_url: string;
  archive_label: string;
  archive_copy: string;
  archive_link_label: string;
  archive_url: string;
  sender_name: string;
  sender_email: string;
  reply_to: string;
}

export interface ListingBucketContent {
  id: string;
  label: string;
  note: string;
}

export interface ListingPageContent {
  title: string;
  description: string;
  hero_title: string;
  hero_summary: string;
  section_label?: string;
  hero_link_label?: string;
  hero_link_href?: string;
  search_placeholder?: string;
  buckets?: ListingBucketContent[];
}

export interface SystemsPageContent {
  workflow: {
    intro: string;
    /** Optional closing paragraph rendered after the workflow, absent in legacy records. */
    outro?: string;
    sources: string[];
    steps: Array<{
      id: string;
      label: string;
      detail: string;
      marks: string[];
    }>;
    feedback: string;
  };
  title: string;
  description: string;
  hero_title: string;
  hero_summary: string;
}
