import type {
  CmsEditorLink,
  CmsProjectContent,
  CmsWritingContent,
  ListingBucketContent,
  ListingPageContent,
  NewsletterContent,
  OrchestratingPageContent,
  SystemsPageContent,
} from "@anipotts/types";
import {
  CMS_TEXT_LIMITS,
  DEFAULT_NEWSLETTER_CONTENT,
  DEFAULT_ORCHESTRATING_CONTENT,
  DEFAULT_SYSTEMS_CONTENT,
  DEFAULT_WRITING_INDEX_CONTENT,
} from "./defaults.js";

function coerceString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return fallback;
}

function coerceNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : fallback;
}

function normalizeSlug(value: unknown, fallback = "untitled"): string {
  const raw = coerceString(value, fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return (raw || fallback).slice(0, CMS_TEXT_LIMITS.slug);
}

function parseJsonArray<T = unknown>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function cmsProjectPageKey(slug: string): string {
  return `project:${normalizeSlug(slug, "project")}`;
}

export function cmsWritingPageKey(slug: string): string {
  return `writing:${normalizeSlug(slug, "writing")}`;
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 12);
  }
  if (typeof value === "string") {
    const parsed = parseJsonArray<string>(value);
    if (parsed.length > 0) return normalizeTags(parsed);
    return value
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 12);
  }
  return [];
}

function normalizeListingBuckets(
  value: unknown,
  fallback: ListingBucketContent[] = [],
): ListingBucketContent[] {
  const source = Array.isArray(value) ? value : fallback;
  const buckets = source
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
    )
    .map((item) => ({
      id: normalizeSlug(item.id, "bucket"),
      label: coerceString(item.label, "").trim(),
      note: coerceString(item.note, "").trim(),
    }))
    .filter((bucket) => bucket.id && bucket.label && bucket.note)
    .slice(0, 12);

  return buckets.length > 0 ? buckets : fallback;
}

function normalizeLinks(value: unknown): CmsEditorLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((link): link is Record<string, unknown> =>
      Boolean(link && typeof link === "object"),
    )
    .map((link) => ({
      label: coerceString(link.label, "").trim(),
      url: coerceString(link.url ?? link.href, "").trim(),
    }))
    .filter((link) => link.label || link.url)
    .slice(0, 4);
}

function isSafeCmsUrl(url: string): boolean {
  if (!url || /[\u0000-\u001f\u007f\s]/.test(url)) return false;
  if (url.startsWith("/")) return !url.startsWith("//");
  if (!url.startsWith("https://") && !url.startsWith("mailto:")) return false;
  try {
    const parsed = new URL(url);
    return ["https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function validateCmsString(
  value: string,
  label: string,
  maxLength: number,
  required = true,
): string | null {
  if (required && !value.trim()) return `${label} is required`;
  if (value.length > maxLength) return `${label} is too long`;
  return null;
}

function validateCmsLinks(
  links: CmsEditorLink[],
  owner: string,
): string | null {
  for (const link of links) {
    const error =
      validateCmsString(
        link.label,
        `${owner} link label`,
        CMS_TEXT_LIMITS.linkLabel,
      ) ??
      validateCmsString(link.url, `${owner} link`, CMS_TEXT_LIMITS.linkUrl) ??
      (!isSafeCmsUrl(link.url)
        ? `${owner} link must start with /, https://, or mailto:`
        : null);
    if (error) return error;
  }
  return null;
}

function normalizeProjectStatus(value: unknown): CmsProjectContent["status"] {
  const status = coerceString(value, "wip").trim().toLowerCase();
  if (status === "live") return "live";
  if (status === "archived") return "archived";
  return "wip";
}

function normalizeProjectKind(value: unknown): CmsProjectContent["kind"] {
  return value === "experience" ? "experience" : "project";
}

function normalizeProjectPublicState(
  value: unknown,
): CmsProjectContent["public_state"] {
  if (value === "featured") return "featured";
  if (value === "hidden") return "hidden";
  return "listed";
}

function normalizeHomepagePlacement(
  value: unknown,
): CmsProjectContent["homepage_placement"] {
  if (value === "experience") return "experience";
  if (value === "making") return "making";
  return "none";
}

function normalizeCatalogGroup(
  value: unknown,
): CmsProjectContent["catalog_group"] {
  if (value === "active") return "active";
  if (value === "taken_down") return "taken_down";
  return "past";
}

export function normalizeCmsProject(
  project: unknown,
  fallback?: Partial<CmsProjectContent>,
): CmsProjectContent {
  const source =
    project && typeof project === "object"
      ? (project as Record<string, unknown>)
      : {};
  const links = normalizeLinks(source.links);
  if (typeof source.link_live === "string" && source.link_live.trim()) {
    links.push({ label: "live site", url: source.link_live.trim() });
  }
  if (typeof source.link_repo === "string" && source.link_repo.trim()) {
    links.push({ label: "source", url: source.link_repo.trim() });
  }

  return {
    id: coerceString(source.id, fallback?.id ?? "") || undefined,
    slug: normalizeSlug(source.slug, fallback?.slug ?? "project"),
    title: coerceString(source.title, fallback?.title ?? "").trim(),
    status: normalizeProjectStatus(source.status ?? fallback?.status),
    year: coerceString(source.year, fallback?.year ?? "").trim(),
    range: coerceString(
      source.range ?? source.duration,
      fallback?.range ?? "",
    ).trim(),
    tags: normalizeTags(source.tags ?? fallback?.tags),
    summary: coerceString(
      source.summary ?? source.subtitle,
      fallback?.summary ?? "",
    ).trim(),
    body: coerceString(
      source.body ?? source.description,
      fallback?.body ?? "",
    ).trim(),
    links: links.slice(0, 4),
    order: coerceNumber(
      source.order ?? source.sort_order,
      fallback?.order ?? 0,
    ),
    kind: normalizeProjectKind(source.kind ?? fallback?.kind),
    public_state: normalizeProjectPublicState(
      source.public_state ?? fallback?.public_state,
    ),
    homepage_placement: normalizeHomepagePlacement(
      source.homepage_placement ?? fallback?.homepage_placement,
    ),
    catalog_group: normalizeCatalogGroup(
      source.catalog_group ?? fallback?.catalog_group,
    ),
    homepage_order: coerceNumber(
      source.homepage_order,
      fallback?.homepage_order ?? 0,
    ),
    card_copy: coerceString(
      source.card_copy ?? source.summary ?? source.subtitle,
      fallback?.card_copy ?? fallback?.summary ?? "",
    ).trim(),
    detail_path: coerceString(
      source.detail_path,
      fallback?.detail_path ??
        `/projects/${normalizeSlug(source.slug, fallback?.slug ?? "project")}`,
    ).trim(),
    identity:
      source.identity && typeof source.identity === "object"
        ? (source.identity as CmsProjectContent["identity"])
        : (fallback?.identity ?? {}),
    preview_media:
      source.preview_media && typeof source.preview_media === "object"
        ? (source.preview_media as CmsProjectContent["preview_media"])
        : (fallback?.preview_media ?? null),
    story: Array.isArray(source.story)
      ? (source.story as CmsProjectContent["story"])
      : (fallback?.story ?? []),
    updated_at:
      coerceString(source.updated_at, fallback?.updated_at ?? "") || null,
  };
}

export function validateCmsProject(project: CmsProjectContent): {
  ok: boolean;
  error?: string;
} {
  const error =
    validateCmsString(project.slug, "Project slug", CMS_TEXT_LIMITS.slug) ??
    validateCmsString(project.title, "Project title", CMS_TEXT_LIMITS.title) ??
    validateCmsString(project.year, "Project year", CMS_TEXT_LIMITS.year) ??
    validateCmsString(project.range, "Project range", CMS_TEXT_LIMITS.range) ??
    validateCmsString(
      project.summary,
      "Project summary",
      CMS_TEXT_LIMITS.summary,
    ) ??
    validateCmsString(
      project.card_copy,
      "Project card copy",
      CMS_TEXT_LIMITS.summary,
    ) ??
    validateCmsString(
      project.detail_path,
      "Project detail path",
      CMS_TEXT_LIMITS.linkUrl,
    ) ??
    validateCmsLinks(project.links, "Project") ??
    (!/^\/projects\/[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(project.detail_path)
      ? "Project detail path must be an internal project route"
      : null) ??
    (!project.identity.logo_src && !project.identity.icon
      ? "Project identity requires a logo or icon"
      : null) ??
    (project.identity.logo_src && !project.identity.logo_src.startsWith("/")
      ? "Project logo must use a local path"
      : null) ??
    (project.preview_media && !project.preview_media.src.startsWith("/")
      ? "Project preview media must use a local path"
      : null) ??
    project.story
      .map((section) =>
        !section.title.trim() || section.paragraphs.length === 0
          ? "Project story sections require a title and paragraph"
          : section.media && !section.media.src.startsWith("/")
            ? "Project story media must use a local path"
            : null,
      )
      .find(Boolean) ??
    (project.kind === "experience" && project.homepage_placement === "making"
      ? "Experience records cannot use the making placement"
      : null) ??
    (project.kind === "project" && project.homepage_placement === "experience"
      ? "Project records cannot use the experience placement"
      : null) ??
    validateCmsString(project.body, "Project body", CMS_TEXT_LIMITS.body) ??
    project.tags
      .map((tag) =>
        validateCmsString(tag, "Project tag", CMS_TEXT_LIMITS.tag, true),
      )
      .find(Boolean);
  return error ? { ok: false, error } : { ok: true };
}

export function normalizeCmsWriting(
  writing: unknown,
  fallback?: Partial<CmsWritingContent>,
): CmsWritingContent {
  const source =
    writing && typeof writing === "object"
      ? (writing as Record<string, unknown>)
      : {};
  const published = coerceBoolean(source.published, fallback?.visible ?? false);
  const status = coerceString(source.status, published ? "published" : "draft");

  return {
    id: coerceString(source.id, fallback?.id ?? "") || undefined,
    slug: normalizeSlug(source.slug, fallback?.slug ?? "writing"),
    title: coerceString(source.title, fallback?.title ?? "").trim(),
    date: coerceString(
      source.date ?? source.published_at ?? source.created_at,
      fallback?.date ?? "",
    ).trim(),
    tags: normalizeTags(source.tags ?? fallback?.tags),
    preview: coerceString(
      source.preview ?? source.summary,
      fallback?.preview ?? "",
    ).trim(),
    body: coerceString(
      source.body ?? source.content,
      fallback?.body ?? "",
    ).trim(),
    sourceLinks: normalizeLinks(
      source.sourceLinks ??
        (source.artifact_url
          ? [
              {
                label: coerceString(source.artifact_type, "source"),
                url: source.artifact_url,
              },
            ]
          : fallback?.sourceLinks),
    ),
    visible:
      source.visible === undefined
        ? status === "published"
        : coerceBoolean(source.visible, false),
    order: coerceNumber(source.order, fallback?.order ?? 0),
    updated_at:
      coerceString(source.updated_at, fallback?.updated_at ?? "") || null,
  };
}

export function validateCmsWriting(writing: CmsWritingContent): {
  ok: boolean;
  error?: string;
} {
  const error =
    validateCmsString(writing.slug, "Writing slug", CMS_TEXT_LIMITS.slug) ??
    validateCmsString(writing.title, "Writing title", CMS_TEXT_LIMITS.title) ??
    validateCmsString(writing.date, "Writing date", CMS_TEXT_LIMITS.year) ??
    validateCmsString(
      writing.preview,
      "Writing preview",
      CMS_TEXT_LIMITS.summary,
    ) ??
    validateCmsString(writing.body, "Writing body", CMS_TEXT_LIMITS.body) ??
    writing.tags
      .map((tag) =>
        validateCmsString(tag, "Writing tag", CMS_TEXT_LIMITS.tag, true),
      )
      .find(Boolean) ??
    validateCmsLinks(writing.sourceLinks, "Writing");
  return error ? { ok: false, error } : { ok: true };
}

export function normalizeNewsletterContent(
  content: unknown,
): NewsletterContent {
  const source =
    content && typeof content === "object"
      ? (content as Record<string, unknown>)
      : {};
  return {
    headline: coerceString(
      source.headline,
      DEFAULT_NEWSLETTER_CONTENT.headline,
    ).trim(),
    deck: coerceString(source.deck, DEFAULT_NEWSLETTER_CONTENT.deck).trim(),
    cta_label: coerceString(
      source.cta_label,
      DEFAULT_NEWSLETTER_CONTENT.cta_label,
    ).trim(),
    success_message: coerceString(
      source.success_message,
      DEFAULT_NEWSLETTER_CONTENT.success_message,
    ).trim(),
    error_message: coerceString(
      source.error_message,
      DEFAULT_NEWSLETTER_CONTENT.error_message,
    ).trim(),
    footer_text: coerceString(
      source.footer_text,
      DEFAULT_NEWSLETTER_CONTENT.footer_text,
    ).trim(),
    buttondown_url: coerceString(
      source.buttondown_url,
      DEFAULT_NEWSLETTER_CONTENT.buttondown_url,
    ).trim(),
    archive_label: coerceString(
      source.archive_label,
      DEFAULT_NEWSLETTER_CONTENT.archive_label,
    ).trim(),
    archive_copy: coerceString(
      source.archive_copy,
      DEFAULT_NEWSLETTER_CONTENT.archive_copy,
    ).trim(),
    archive_link_label: coerceString(
      source.archive_link_label,
      DEFAULT_NEWSLETTER_CONTENT.archive_link_label,
    ).trim(),
    archive_url: coerceString(
      source.archive_url,
      DEFAULT_NEWSLETTER_CONTENT.archive_url,
    ).trim(),
    sender_name: coerceString(
      source.sender_name,
      DEFAULT_NEWSLETTER_CONTENT.sender_name,
    ).trim(),
    sender_email: coerceString(
      source.sender_email,
      DEFAULT_NEWSLETTER_CONTENT.sender_email,
    ).trim(),
    reply_to: coerceString(
      source.reply_to,
      DEFAULT_NEWSLETTER_CONTENT.reply_to,
    ).trim(),
  };
}

export function validateNewsletterContent(content: NewsletterContent): {
  ok: boolean;
  error?: string;
} {
  const error =
    validateCmsString(
      content.headline,
      "Newsletter headline",
      CMS_TEXT_LIMITS.newsletterHeadline,
    ) ??
    validateCmsString(
      content.deck,
      "Newsletter deck",
      CMS_TEXT_LIMITS.newsletterDeck,
    ) ??
    validateCmsString(
      content.cta_label,
      "Newsletter button",
      CMS_TEXT_LIMITS.linkLabel,
    ) ??
    validateCmsString(
      content.success_message,
      "Newsletter success message",
      CMS_TEXT_LIMITS.newsletterDeck,
    ) ??
    validateCmsString(
      content.error_message,
      "Newsletter error message",
      CMS_TEXT_LIMITS.newsletterDeck,
    ) ??
    validateCmsString(
      content.footer_text,
      "Newsletter footer",
      CMS_TEXT_LIMITS.newsletterFooter,
      false,
    ) ??
    validateCmsString(
      content.buttondown_url,
      "Newsletter URL",
      CMS_TEXT_LIMITS.linkUrl,
      false,
    ) ??
    validateCmsString(
      content.archive_label,
      "Newsletter archive label",
      CMS_TEXT_LIMITS.linkLabel,
    ) ??
    validateCmsString(
      content.archive_copy,
      "Newsletter archive copy",
      CMS_TEXT_LIMITS.newsletterDeck,
    ) ??
    validateCmsString(
      content.archive_link_label,
      "Newsletter archive link label",
      CMS_TEXT_LIMITS.linkLabel,
    ) ??
    validateCmsString(
      content.archive_url,
      "Newsletter archive URL",
      CMS_TEXT_LIMITS.linkUrl,
    ) ??
    validateCmsString(
      content.sender_name,
      "Sender name",
      CMS_TEXT_LIMITS.sender,
    ) ??
    validateCmsString(
      content.sender_email,
      "Sender email",
      CMS_TEXT_LIMITS.sender,
    ) ??
    validateCmsString(content.reply_to, "Reply-to", CMS_TEXT_LIMITS.sender);
  if (error) return { ok: false, error };
  if (content.buttondown_url && !isSafeCmsUrl(content.buttondown_url)) {
    return { ok: false, error: "Newsletter URL is invalid" };
  }
  if (!isSafeCmsUrl(content.archive_url)) {
    return { ok: false, error: "Newsletter archive URL is invalid" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content.sender_email)) {
    return { ok: false, error: "Sender email is invalid" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content.reply_to)) {
    return { ok: false, error: "Reply-to is invalid" };
  }
  return { ok: true };
}

export function normalizeListingPageContent(
  content: unknown,
  fallback: ListingPageContent = DEFAULT_WRITING_INDEX_CONTENT,
): ListingPageContent {
  const source =
    content && typeof content === "object"
      ? (content as Record<string, unknown>)
      : {};

  return {
    title: coerceString(source.title, fallback.title).trim(),
    description: coerceString(source.description, fallback.description).trim(),
    hero_title: coerceString(source.hero_title, fallback.hero_title).trim(),
    hero_summary: coerceString(
      source.hero_summary,
      fallback.hero_summary,
    ).trim(),
    section_label: coerceString(
      source.section_label,
      fallback.section_label ?? "",
    ).trim(),
    hero_link_label: coerceString(
      source.hero_link_label,
      fallback.hero_link_label ?? "",
    ).trim(),
    hero_link_href: coerceString(
      source.hero_link_href,
      fallback.hero_link_href ?? "",
    ).trim(),
    search_placeholder: coerceString(
      source.search_placeholder,
      fallback.search_placeholder ?? "",
    ).trim(),
    buckets: normalizeListingBuckets(source.buckets, fallback.buckets ?? []),
  };
}

export function validateListingPageContent(content: ListingPageContent): {
  ok: boolean;
  error?: string;
} {
  const error =
    validateCmsString(
      content.title,
      "Listing page title",
      CMS_TEXT_LIMITS.title,
    ) ??
    validateCmsString(
      content.description,
      "Listing page description",
      CMS_TEXT_LIMITS.summary,
    ) ??
    validateCmsString(
      content.hero_title,
      "Listing page hero title",
      CMS_TEXT_LIMITS.title,
    ) ??
    validateCmsString(
      content.hero_summary,
      "Listing page hero summary",
      CMS_TEXT_LIMITS.summary,
    ) ??
    validateCmsString(
      content.section_label ?? "",
      "Listing page section label",
      CMS_TEXT_LIMITS.title,
      false,
    ) ??
    validateCmsString(
      content.search_placeholder ?? "",
      "Listing page search placeholder",
      CMS_TEXT_LIMITS.title,
      false,
    ) ??
    validateListingBuckets(content.buckets ?? []) ??
    validateListingHeroLink(content);

  return error ? { ok: false, error } : { ok: true };
}

function validateListingBuckets(
  buckets: ListingBucketContent[],
): string | null {
  for (const bucket of buckets) {
    const error =
      validateCmsString(
        bucket.id,
        "Listing page bucket id",
        CMS_TEXT_LIMITS.slug,
      ) ??
      validateCmsString(
        bucket.label,
        "Listing page bucket label",
        CMS_TEXT_LIMITS.linkLabel,
      ) ??
      validateCmsString(
        bucket.note,
        "Listing page bucket note",
        CMS_TEXT_LIMITS.summary,
      ) ??
      (!/^[a-z][a-z0-9-]*$/.test(bucket.id)
        ? "Listing page bucket id must be lowercase kebab-case"
        : null);
    if (error) return error;
  }
  return null;
}

function validateListingHeroLink(content: ListingPageContent): string | null {
  const hasLabel = Boolean(content.hero_link_label?.trim());
  const hasHref = Boolean(content.hero_link_href?.trim());
  if (!hasLabel && !hasHref) return null;
  if (!hasLabel) return "Listing page hero link label is required";
  if (!hasHref) return "Listing page hero link is required";
  return (
    validateCmsString(
      content.hero_link_label ?? "",
      "Listing page hero link label",
      CMS_TEXT_LIMITS.linkLabel,
    ) ??
    validateCmsString(
      content.hero_link_href ?? "",
      "Listing page hero link",
      CMS_TEXT_LIMITS.linkUrl,
    ) ??
    (!isSafeCmsUrl(content.hero_link_href ?? "")
      ? "Listing page hero link must start with /, https://, or mailto:"
      : null)
  );
}

export function normalizeOrchestratingPageContent(
  content: unknown,
): OrchestratingPageContent {
  const source =
    content && typeof content === "object"
      ? (content as Record<string, unknown>)
      : {};

  return {
    title: coerceString(
      source.title,
      DEFAULT_ORCHESTRATING_CONTENT.title,
    ).trim(),
    description: coerceString(
      source.description,
      DEFAULT_ORCHESTRATING_CONTENT.description,
    ).trim(),
    section_label: coerceString(
      source.section_label,
      DEFAULT_ORCHESTRATING_CONTENT.section_label,
    ).trim(),
    hero_title: coerceString(
      source.hero_title,
      DEFAULT_ORCHESTRATING_CONTENT.hero_title,
    ).trim(),
    hero_summary: coerceString(
      source.hero_summary,
      DEFAULT_ORCHESTRATING_CONTENT.hero_summary,
    ).trim(),
    panel_label: coerceString(
      source.panel_label,
      DEFAULT_ORCHESTRATING_CONTENT.panel_label,
    ).trim(),
    panel_copy: coerceString(
      source.panel_copy,
      DEFAULT_ORCHESTRATING_CONTENT.panel_copy,
    ).trim(),
    sections: normalizeOrchestratingSectionLabels(source.sections),
    loop_cards: normalizeOrchestratingLoopCards(source.loop_cards),
    public_tools: normalizeOrchestratingLinkCards(source.public_tools),
  };
}

export function normalizeSystemsPageContent(
  content: unknown,
): SystemsPageContent {
  const source =
    content && typeof content === "object"
      ? (content as Record<string, unknown>)
      : {};
  const principles = Array.isArray(source.principles)
    ? source.principles
        .filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object" && !Array.isArray(item)),
        )
        .map((item) => ({
          label: coerceString(item.label, "").trim(),
          title: coerceString(item.title, "").trim(),
          detail: coerceString(item.detail, "").trim(),
        }))
        .filter((item) => item.label && item.title && item.detail)
        .slice(0, 8)
    : DEFAULT_SYSTEMS_CONTENT.principles;
  const tools = Array.isArray(source.public_tools)
    ? source.public_tools
        .filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object" && !Array.isArray(item)),
        )
        .map((item) => ({
          title: coerceString(item.title, "").trim(),
          href: coerceString(item.href, "").trim(),
          detail: coerceString(item.detail, "").trim(),
        }))
        .filter((item) => item.title && item.href && item.detail)
        .slice(0, 8)
    : DEFAULT_SYSTEMS_CONTENT.public_tools;
  const featured =
    source.featured_writing && typeof source.featured_writing === "object"
      ? (source.featured_writing as Record<string, unknown>)
      : {};
  const mapDomains = Array.isArray(source.map_domains)
    ? source.map_domains
        .filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object" && !Array.isArray(item)),
        )
        .map((item) => ({
          label: coerceString(item.label, "").trim(),
          children: Array.isArray(item.children)
            ? item.children
                .map((child) => coerceString(child, "").trim())
                .filter(Boolean)
                .slice(0, 4)
            : [],
        }))
        .filter((item) => item.label)
        .slice(0, 4)
    : DEFAULT_SYSTEMS_CONTENT.map_domains;

  return {
    title: coerceString(source.title, DEFAULT_SYSTEMS_CONTENT.title).trim(),
    description: coerceString(
      source.description,
      DEFAULT_SYSTEMS_CONTENT.description,
    ).trim(),
    hero_title: coerceString(
      source.hero_title,
      DEFAULT_SYSTEMS_CONTENT.hero_title,
    ).trim(),
    hero_summary: coerceString(
      source.hero_summary,
      DEFAULT_SYSTEMS_CONTENT.hero_summary,
    ).trim(),
    map_principle: coerceString(
      source.map_principle,
      DEFAULT_SYSTEMS_CONTENT.map_principle,
    ).trim(),
    map_domains: mapDomains.length
      ? mapDomains
      : DEFAULT_SYSTEMS_CONTENT.map_domains,
    principles_label: coerceString(
      source.principles_label,
      DEFAULT_SYSTEMS_CONTENT.principles_label,
    ).trim(),
    principles: principles.length
      ? principles
      : DEFAULT_SYSTEMS_CONTENT.principles,
    writing_label: coerceString(
      source.writing_label,
      DEFAULT_SYSTEMS_CONTENT.writing_label,
    ).trim(),
    featured_writing: {
      title: coerceString(
        featured.title,
        DEFAULT_SYSTEMS_CONTENT.featured_writing.title,
      ).trim(),
      href: coerceString(
        featured.href,
        DEFAULT_SYSTEMS_CONTENT.featured_writing.href,
      ).trim(),
      detail: coerceString(
        featured.detail,
        DEFAULT_SYSTEMS_CONTENT.featured_writing.detail,
      ).trim(),
    },
    tools_label: coerceString(
      source.tools_label,
      DEFAULT_SYSTEMS_CONTENT.tools_label,
    ).trim(),
    public_tools: tools.length ? tools : DEFAULT_SYSTEMS_CONTENT.public_tools,
  };
}

export function validateSystemsPageContent(content: SystemsPageContent): {
  ok: boolean;
  error?: string;
} {
  const baseFields = [
    [content.title, "Systems title"],
    [content.description, "Systems description"],
    [content.hero_title, "Systems hero title"],
    [content.hero_summary, "Systems hero summary"],
    [content.map_principle, "Systems map principle"],
    [content.principles_label, "Systems principles label"],
    [content.writing_label, "Systems writing label"],
    [content.tools_label, "Systems tools label"],
  ] as const;
  for (const [value, label] of baseFields) {
    const error = validateCmsString(value, label, CMS_TEXT_LIMITS.summary);
    if (error) return { ok: false, error };
  }
  const canonicalDomains = ["career", "learning", "wellbeing", "personal"];
  const domainLabels = content.map_domains.map(({ label }) => label);
  if (
    domainLabels.length !== canonicalDomains.length ||
    new Set(domainLabels).size !== domainLabels.length ||
    !canonicalDomains.every((label) => domainLabels.includes(label))
  ) {
    return {
      ok: false,
      error: "Systems map needs the four canonical, unique life domains",
    };
  }
  for (const domain of content.map_domains) {
    if (new Set(domain.children).size !== domain.children.length) {
      return {
        ok: false,
        error: `Systems map domain ${domain.label} has duplicate children`,
      };
    }
  }
  if (content.principles.length === 0) {
    return { ok: false, error: "Systems principles are required" };
  }
  const links = [content.featured_writing, ...content.public_tools];
  for (const link of links) {
    if (!link.title || !link.detail || !isSafeCmsUrl(link.href)) {
      return { ok: false, error: "Systems links need safe, complete content" };
    }
  }
  return { ok: true };
}

function normalizeOrchestratingSectionLabels(
  value: unknown,
): OrchestratingPageContent["sections"] {
  const fallback = DEFAULT_ORCHESTRATING_CONTENT.sections;
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    systems: coerceString(source.systems, fallback.systems).trim(),
    loop: coerceString(source.loop, fallback.loop).trim(),
    public_tools: coerceString(
      source.public_tools,
      fallback.public_tools,
    ).trim(),
    public_tools_note: coerceString(
      source.public_tools_note,
      fallback.public_tools_note,
    ).trim(),
    status: coerceString(source.status, fallback.status).trim(),
    status_note: coerceString(source.status_note, fallback.status_note).trim(),
    records: coerceString(source.records, fallback.records).trim(),
    plugin: coerceString(source.plugin, fallback.plugin).trim(),
    hooks: coerceString(source.hooks, fallback.hooks).trim(),
    playbooks: coerceString(source.playbooks, fallback.playbooks).trim(),
    sessions: coerceString(source.sessions, fallback.sessions).trim(),
  };
}

function normalizeOrchestratingLoopCards(
  value: unknown,
): OrchestratingPageContent["loop_cards"] {
  if (!Array.isArray(value)) return DEFAULT_ORCHESTRATING_CONTENT.loop_cards;

  const cards = value
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
    )
    .slice(0, 8)
    .map((item) => ({
      label: coerceString(item.label, "").trim(),
      title: coerceString(item.title, "").trim(),
      detail: coerceString(item.detail, "").trim(),
    }))
    .filter((item) => item.label && item.title && item.detail);

  return cards.length > 0 ? cards : DEFAULT_ORCHESTRATING_CONTENT.loop_cards;
}

function normalizeOrchestratingLinkCards(
  value: unknown,
): OrchestratingPageContent["public_tools"] {
  if (!Array.isArray(value)) return DEFAULT_ORCHESTRATING_CONTENT.public_tools;

  const cards = value
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
    )
    .slice(0, 8)
    .map((item) => ({
      title: coerceString(item.title, "").trim(),
      href: coerceString(item.href, "").trim(),
      detail: coerceString(item.detail, "").trim(),
    }))
    .filter((item) => item.title && isSafeCmsUrl(item.href) && item.detail);

  return cards.length > 0 ? cards : DEFAULT_ORCHESTRATING_CONTENT.public_tools;
}

export function validateOrchestratingPageContent(
  content: OrchestratingPageContent,
): { ok: boolean; error?: string } {
  const error =
    validateCmsString(
      content.title,
      "Orchestrating page title",
      CMS_TEXT_LIMITS.title,
    ) ??
    validateCmsString(
      content.description,
      "Orchestrating page description",
      CMS_TEXT_LIMITS.summary,
    ) ??
    validateCmsString(
      content.section_label,
      "Orchestrating section label",
      CMS_TEXT_LIMITS.linkLabel,
    ) ??
    validateCmsString(
      content.hero_title,
      "Orchestrating hero title",
      CMS_TEXT_LIMITS.title,
    ) ??
    validateCmsString(
      content.hero_summary,
      "Orchestrating hero summary",
      CMS_TEXT_LIMITS.summary,
    ) ??
    validateCmsString(
      content.panel_label,
      "Orchestrating panel label",
      CMS_TEXT_LIMITS.linkLabel,
    ) ??
    validateCmsString(
      content.panel_copy,
      "Orchestrating panel copy",
      CMS_TEXT_LIMITS.summary,
    ) ??
    validateOrchestratingSections(content) ??
    validateOrchestratingLoopCards(content) ??
    validateOrchestratingLinkCards(content);

  return error ? { ok: false, error } : { ok: true };
}

function validateOrchestratingSections(
  content: OrchestratingPageContent,
): string | null {
  return (
    Object.entries(content.sections)
      .map(([key, value]) =>
        validateCmsString(
          value,
          `Orchestrating ${key.replaceAll("_", " ")}`,
          CMS_TEXT_LIMITS.linkLabel,
        ),
      )
      .find(Boolean) ?? null
  );
}

function validateOrchestratingLoopCards(
  content: OrchestratingPageContent,
): string | null {
  return (
    content.loop_cards
      .flatMap((card, index) => [
        validateCmsString(
          card.label,
          `Orchestrating loop card ${index + 1} label`,
          CMS_TEXT_LIMITS.linkLabel,
        ),
        validateCmsString(
          card.title,
          `Orchestrating loop card ${index + 1} title`,
          CMS_TEXT_LIMITS.title,
        ),
        validateCmsString(
          card.detail,
          `Orchestrating loop card ${index + 1} detail`,
          CMS_TEXT_LIMITS.summary,
        ),
      ])
      .find(Boolean) ?? null
  );
}

function validateOrchestratingLinkCards(
  content: OrchestratingPageContent,
): string | null {
  for (const [index, card] of content.public_tools.entries()) {
    const error =
      validateCmsString(
        card.title,
        `Orchestrating public tool ${index + 1} title`,
        CMS_TEXT_LIMITS.title,
      ) ??
      validateCmsString(
        card.href,
        `Orchestrating public tool ${index + 1} link`,
        CMS_TEXT_LIMITS.linkUrl,
      ) ??
      (!isSafeCmsUrl(card.href)
        ? `Orchestrating public tool ${index + 1} link must start with /, https://, or mailto:`
        : null) ??
      validateCmsString(
        card.detail,
        `Orchestrating public tool ${index + 1} detail`,
        CMS_TEXT_LIMITS.summary,
      );
    if (error) return error;
  }
  return null;
}
