// Record shapes that scripts/content/generate-public-content.mjs emits into
// generated.ts as DEFAULT_CMS_PROJECTS and DEFAULT_CMS_WRITING. They are
// projections of the zod frontmatter in schema.ts, kept in the d1-era row
// shape that the admin editor and the public route inventory read.

export interface ProjectionLink {
  label: string;
  url: string;
}

export interface ProjectionMedia {
  kind: "image" | "gif" | "video";
  src: string;
  alt: string;
  caption?: string;
  fit?: "cover" | "contain";
}

export interface ProjectionStorySection {
  title: string;
  paragraphs: string[];
  media?: ProjectionMedia;
}

export interface ProjectProjection {
  id?: string;
  slug: string;
  title: string;
  status: "live" | "wip" | "archived";
  year: string;
  range: string;
  tags: string[];
  summary: string;
  body: string;
  links: ProjectionLink[];
  order: number;
  kind: "experience" | "project";
  public_state: "featured" | "listed" | "hidden";
  homepage_placement: "experience" | "work" | "none";
  catalog_group: "active" | "past" | "taken_down";
  homepage_order: number;
  card_copy: string;
  card_copy_compact?: string;
  card_title?: string;
  detail_path: string;
  identity: {
    logo_src?: string;
    logo_alt?: string;
    logo_tone?: "default" | "light" | "adaptive";
    icon?: string;
  };
  preview_media: ProjectionMedia | null;
  story: ProjectionStorySection[];
  updated_at?: string | null;
}

export interface WritingProjection {
  id?: string;
  slug: string;
  title: string;
  date: string;
  tags: string[];
  preview: string;
  body: string;
  sourceLinks: ProjectionLink[];
  visible: boolean;
  order: number;
  updated_at?: string | null;
}

// d1-era homepage rich summary rows. The zod homepage schema has no
// rich_summary field; these stay exported for the public entry until the
// legacy homepage normalizer is removed.

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
