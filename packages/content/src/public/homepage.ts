import { inlinePlainText } from "./inline.js";
import type {
  HomepageContent,
  HomepageMention,
  HomepageRichSummarySegment,
  HomepageRichSummarySentence,
  HomepageRichSummarySimpleSegment,
  HomepageSection,
} from "@anipotts/types";
import {
  DEFAULT_HOMEPAGE_CONTENT,
  HOMEPAGE_FIELD_LIMITS,
  HOME_SECTION_ORDER,
} from "./defaults.js";

export type HomepageInlineSummarySegment =
  | { kind: "text"; text: string }
  | { kind: "mention"; key: string; text: string; suffix?: string };

const wordCharacter = /[\p{L}\p{N}_]/u;

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findMention(
  paragraph: string,
  label: string,
  cursor: number,
): { index: number; length: number } | undefined {
  const matcher = new RegExp(escapeRegularExpression(label), "giu");
  matcher.lastIndex = cursor;
  let match = matcher.exec(paragraph);

  while (match) {
    const index = match.index;
    const matchedText = match[0];
    const before = paragraph[index - 1];
    const after = paragraph[index + matchedText.length];
    const beginsWithWord = wordCharacter.test(matchedText[0] ?? "");
    const endsWithWord = wordCharacter.test(matchedText.at(-1) ?? "");
    const touchesWordBefore =
      beginsWithWord && wordCharacter.test(before ?? "");
    const touchesWordAfter = endsWithWord && wordCharacter.test(after ?? "");

    if (!touchesWordBefore && !touchesWordAfter) {
      return { index, length: matchedText.length };
    }
    match = matcher.exec(paragraph);
  }

  return undefined;
}

export function segmentHomepageSummaryParagraph(
  paragraph: string,
  mentionKeys: string[],
  mentions: Record<string, HomepageMention>,
): HomepageInlineSummarySegment[] {
  const candidates = mentionKeys
    .flatMap((key) => (mentions[key] ? [{ key, mention: mentions[key] }] : []))
    .sort((a, b) => b.mention.label.length - a.mention.label.length);
  const segments: HomepageInlineSummarySegment[] = [];
  let cursor = 0;

  while (cursor < paragraph.length) {
    const next = candidates
      .flatMap((candidate) => {
        const match = findMention(paragraph, candidate.mention.label, cursor);
        return match ? [{ ...candidate, ...match }] : [];
      })
      .sort(
        (a, b) =>
          a.index - b.index || b.mention.label.length - a.mention.label.length,
      )[0];

    if (!next) {
      segments.push({ kind: "text", text: paragraph.slice(cursor) });
      break;
    }

    if (next.index > cursor) {
      segments.push({
        kind: "text",
        text: paragraph.slice(cursor, next.index),
      });
    }

    const labelEnd = next.index + next.length;
    const suffixMatch = paragraph.slice(labelEnd).match(/^[),.;:!?]+/);
    const mentionSegment = {
      kind: "mention" as const,
      key: next.key,
      text: paragraph.slice(next.index, labelEnd),
    };
    segments.push(
      suffixMatch?.[0]
        ? { ...mentionSegment, suffix: suffixMatch[0] }
        : mentionSegment,
    );
    cursor = labelEnd + (suffixMatch?.[0].length ?? 0);
  }

  return segments;
}

function coerceString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return fallback;
}

function coercePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  return Math.min(
    HOMEPAGE_FIELD_LIMITS.limitMax,
    Math.max(HOMEPAGE_FIELD_LIMITS.limitMin, value),
  );
}

function normalizeSection(
  section: unknown,
  fallback: HomepageSection,
): HomepageSection {
  const source =
    section && typeof section === "object"
      ? (section as Record<string, unknown>)
      : {};

  const normalized: HomepageSection = {
    visible: coerceBoolean(source.visible, fallback.visible),
    label: coerceString(source.label, fallback.label).trim(),
    heading: coerceString(source.heading, fallback.heading).trim(),
  };

  if (source.subheading !== undefined || fallback.subheading !== undefined) {
    normalized.subheading =
      source.subheading === undefined
        ? fallback.subheading
        : coerceString(source.subheading, fallback.subheading ?? "").trim();
  }

  if (source.subheading_format === "markdown")
    normalized.subheading_format = "markdown";

  const hasSourceSubheading =
    typeof source.subheading === "string" &&
    source.subheading.trim().length > 0;
  if (
    Array.isArray(source.rich_summary) ||
    (fallback.rich_summary !== undefined && !hasSourceSubheading)
  ) {
    normalized.rich_summary = normalizeRichSummary(
      source.rich_summary,
      fallback.rich_summary ?? [],
    );
  }

  if (Array.isArray(source.paragraphs)) {
    const paragraphs = source.paragraphs
      .filter((paragraph): paragraph is string => typeof paragraph === "string")
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
    normalized.paragraphs =
      paragraphs.length > 0 ? paragraphs : fallback.paragraphs;
  } else if (fallback.paragraphs !== undefined) {
    normalized.paragraphs = fallback.paragraphs;
  }

  if (Array.isArray(source.links)) {
    normalized.links = source.links
      .filter(
        (
          link,
        ): link is {
          label: string;
          href: string;
        } =>
          Boolean(link) &&
          typeof link === "object" &&
          typeof (link as Record<string, unknown>).label === "string" &&
          typeof (link as Record<string, unknown>).href === "string",
      )
      .map((link) => ({
        label: link.label.trim(),
        href: link.href.trim(),
      }));
  } else if (fallback.links !== undefined) {
    normalized.links = fallback.links;
  }

  if (source.limit !== undefined || fallback.limit !== undefined) {
    normalized.limit = coercePositiveInteger(source.limit, fallback.limit ?? 1);
  }

  if (source.view_all !== undefined || fallback.view_all !== undefined) {
    normalized.view_all =
      source.view_all === undefined
        ? fallback.view_all
        : coerceString(source.view_all, fallback.view_all ?? "");
  }

  if (
    Array.isArray(source.mention_keys) ||
    fallback.mention_keys !== undefined
  ) {
    normalized.mention_keys = normalizeMentionKeyList(
      source.mention_keys,
      fallback.mention_keys ?? [],
    );
  }

  if (
    Array.isArray(source.writing_slugs) ||
    fallback.writing_slugs !== undefined
  ) {
    normalized.writing_slugs = normalizeSlugList(
      source.writing_slugs,
      fallback.writing_slugs ?? [],
    );
  }

  return normalized;
}

function normalizeMentionKeyList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;

  const keys = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(isSafeMentionKey)
    .slice(0, HOMEPAGE_FIELD_LIMITS.limitMax);

  return keys.length > 0 ? keys : fallback;
}

function normalizeSlugList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const slugs = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, HOMEPAGE_FIELD_LIMITS.limitMax);

  return slugs.length > 0 ? slugs : fallback;
}

function normalizeRichSummary(
  value: unknown,
  fallback: HomepageRichSummarySentence[],
): HomepageRichSummarySentence[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const sentences = value
    .filter((item): item is Record<string, unknown> => {
      return Boolean(item) && typeof item === "object" && !Array.isArray(item);
    })
    .slice(0, HOMEPAGE_FIELD_LIMITS.limitMax)
    .map((sentence) => ({
      segments: normalizeRichSummarySegments(sentence.segments, 0),
    }))
    .filter((sentence) => sentence.segments.length > 0);

  return sentences.length > 0 ? sentences : fallback;
}

function normalizeRichSummarySegments(
  value: unknown,
  depth: number,
): HomepageRichSummarySegment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => {
      return Boolean(item) && typeof item === "object" && !Array.isArray(item);
    })
    .slice(0, HOMEPAGE_FIELD_LIMITS.limitMax)
    .flatMap((segment) => normalizeRichSummarySegment(segment, depth));
}

function normalizeRichSummarySegment(
  segment: Record<string, unknown>,
  depth: number,
): HomepageRichSummarySegment[] {
  const kind = segment.kind;

  if (kind === "text") {
    const text = coerceString(segment.text, "");
    return text.length > 0 ? [{ kind: "text", text }] : [];
  }

  if (kind === "mention") {
    const key = coerceString(segment.key, "").trim();
    if (!isSafeMentionKey(key)) return [];
    const suffix = coerceString(segment.suffix, "").trim();
    return [
      suffix
        ? { kind: "mention", key, suffix: suffix.slice(0, 12) }
        : { kind: "mention", key },
    ];
  }

  if (kind === "cluster" && depth < 2) {
    const segments = normalizeRichSummarySegments(segment.segments, depth + 1);
    return segments.length > 0 ? [{ kind: "cluster", segments }] : [];
  }

  if (kind === "parens") {
    const segments = normalizeRichSummarySegments(
      segment.segments,
      depth + 1,
    ).filter(isSimpleRichSummarySegment);
    return segments.length > 0 ? [{ kind: "parens", segments }] : [];
  }

  return [];
}

function isSimpleRichSummarySegment(
  segment: HomepageRichSummarySegment,
): segment is HomepageRichSummarySimpleSegment {
  return segment.kind === "text" || segment.kind === "mention";
}

function isSafeMentionKey(key: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*$/.test(key);
}

function normalizeMentions(
  value: unknown,
  fallback: Record<string, HomepageMention>,
): Record<string, HomepageMention> {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const keys = new Set([
    ...Object.keys(fallback),
    ...Object.keys(source).filter(isSafeMentionKey),
  ]);
  const mentions: Record<string, HomepageMention> = {};

  for (const key of keys) {
    const normalized = normalizeMention(source[key], fallback[key]);
    if (normalized) {
      mentions[key] = normalized;
    }
  }

  return Object.keys(mentions).length > 0 ? mentions : fallback;
}

function normalizeMention(
  value: unknown,
  fallback: HomepageMention | undefined,
): HomepageMention | null {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const label = coerceString(source.label, fallback?.label ?? "").trim();

  if (!label) return null;

  const mention: HomepageMention = {
    label,
  };

  copyOptionalString(mention, source, fallback, "href");
  copyOptionalString(mention, source, fallback, "icon");
  copyOptionalString(mention, source, fallback, "mark");
  copyOptionalString(mention, source, fallback, "logoSrc");
  copyOptionalString(mention, source, fallback, "logoAlt");
  copyOptionalString(mention, source, fallback, "badgeSrc");
  copyOptionalString(mention, source, fallback, "badgeAlt");
  copyOptionalString(mention, source, fallback, "visualLabel");
  copyOptionalString(mention, source, fallback, "visualPrefix");
  copyOptionalString(mention, source, fallback, "visualSuffix");
  mention.logoTone = normalizeMentionOption(
    source.logoTone,
    fallback?.logoTone,
    ["native", "white"],
  );
  mention.logoShape = normalizeMentionOption(
    source.logoShape,
    fallback?.logoShape,
    ["square", "wide", "mark", "large"],
  );
  mention.presentation = normalizeMentionOption(
    source.presentation,
    fallback?.presentation,
    ["brand", "facet"],
  );

  return mention;
}

function copyOptionalString<K extends keyof HomepageMention>(
  target: HomepageMention,
  source: Record<string, unknown>,
  fallback: HomepageMention | undefined,
  key: K,
) {
  const sourceKey = String(key);
  const value =
    source[sourceKey] === undefined
      ? fallback?.[key]
      : coerceString(source[sourceKey], "").trim();
  if (typeof value === "string" && value.length > 0) {
    target[key] = value as HomepageMention[K];
  }
}

function normalizeMentionOption<T extends string>(
  value: unknown,
  fallback: T | undefined,
  allowed: readonly T[],
): T | undefined {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : fallback;
}

function isSafeHomepageLink(href: string): boolean {
  if (!href || /[\u0000-\u001f\u007f\s]/.test(href)) return false;
  if (href.startsWith("/")) return !href.startsWith("//");
  if (!href.startsWith("https://")) return false;

  try {
    const parsed = new URL(href);
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function isSafeHomepageAssetPath(path: string): boolean {
  if (!path || /[\u0000-\u001f\u007f\s]/.test(path)) return false;
  return path.startsWith("/images/") && !path.includes("..");
}

function validateTextField(
  value: string,
  label: string,
  maxLength: number,
  required: boolean,
): string | null {
  if (required && !value.trim()) return `${label} is required`;
  if (value.length > maxLength) return `${label} is too long`;
  return null;
}

function validateSectionLabel(section: HomepageSection, label: string) {
  return validateTextField(
    section.label,
    label,
    HOMEPAGE_FIELD_LIMITS.label,
    section.visible,
  );
}

function validateSectionLink(section: HomepageSection, label: string) {
  const link = section.links?.[0];
  if (!section.visible) return null;
  if (!link) return `${label} link is required`;

  return (
    validateTextField(
      link.label,
      `${label} link label`,
      HOMEPAGE_FIELD_LIMITS.linkLabel,
      true,
    ) ??
    validateTextField(
      link.href,
      `${label} link`,
      HOMEPAGE_FIELD_LIMITS.linkHref,
      true,
    ) ??
    (!isSafeHomepageLink(link.href)
      ? `${label} link must start with / or https://`
      : null)
  );
}

function validateSlugList(slugs: string[], label: string): string | null {
  if (slugs.length === 0) return `${label} slugs are required`;
  for (const slug of slugs) {
    if (slug.length > HOMEPAGE_FIELD_LIMITS.slug) {
      return `${label} slug is too long`;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return `${label} slug must be lowercase kebab-case`;
    }
  }
  if (new Set(slugs).size !== slugs.length) {
    return `${label} slugs must be unique`;
  }
  return null;
}

function validateRichSummary(
  sentences: HomepageRichSummarySentence[] | undefined,
): string | null {
  if (!sentences) return null;

  let textLength = 0;
  for (const [sentenceIndex, sentence] of sentences.entries()) {
    if (sentence.segments.length === 0) {
      return `Homepage summary sentence ${sentenceIndex + 1} needs segments`;
    }

    const error = validateRichSummarySegments(
      sentence.segments,
      `Homepage summary sentence ${sentenceIndex + 1}`,
    );
    if (error) return error;
    textLength += richSummaryTextLength(sentence.segments);
  }

  if (textLength > HOMEPAGE_FIELD_LIMITS.subheading) {
    return "Homepage summary is too long";
  }

  return null;
}

function validateRichSummarySegments(
  segments: HomepageRichSummarySegment[],
  label: string,
): string | null {
  for (const [index, segment] of segments.entries()) {
    const segmentLabel = `${label} segment ${index + 1}`;

    if (segment.kind === "text") {
      if (segment.text.length > HOMEPAGE_FIELD_LIMITS.subheading) {
        return `${segmentLabel} is too long`;
      }
      continue;
    }

    if (segment.kind === "mention") {
      if (!isSafeMentionKey(segment.key)) {
        return `${segmentLabel} mention key is invalid`;
      }
      if ((segment.suffix ?? "").length > 12) {
        return `${segmentLabel} suffix is too long`;
      }
      continue;
    }

    if (segment.segments.length === 0) {
      return `${segmentLabel} needs child segments`;
    }

    const nestedError = validateRichSummarySegments(
      segment.segments,
      segmentLabel,
    );
    if (nestedError) return nestedError;
  }

  return null;
}

function richSummaryTextLength(segments: HomepageRichSummarySegment[]): number {
  return segments.reduce((sum, segment) => {
    if (segment.kind === "text") return sum + segment.text.length;
    if (segment.kind === "mention") {
      return sum + segment.key.length + (segment.suffix?.length ?? 0);
    }
    return sum + richSummaryTextLength(segment.segments);
  }, 0);
}

function richSummaryPlainText(
  segments: HomepageRichSummarySegment[],
  mentions: Record<string, HomepageMention>,
): string {
  return segments
    .map((segment) => richSummarySegmentPlainText(segment, mentions))
    .join("");
}

function richSummarySegmentPlainText(
  segment: HomepageRichSummarySegment,
  mentions: Record<string, HomepageMention>,
): string {
  if (segment.kind === "text") return segment.text;
  if (segment.kind === "mention") {
    return `${mentions[segment.key]?.label ?? segment.key}${segment.suffix ?? ""}`;
  }
  if (segment.kind === "parens") {
    return ` (${richSummaryPlainText(segment.segments, mentions)})`;
  }
  return richSummaryPlainText(segment.segments, mentions);
}

function collectRichSummaryMentionKeys(
  sentences: HomepageRichSummarySentence[] | undefined,
): string[] {
  if (!sentences) return [];
  const keys = new Set<string>();
  for (const sentence of sentences) {
    collectMentionKeysFromSegments(sentence.segments, keys);
  }
  return [...keys];
}

function collectMentionKeysFromSegments(
  segments: HomepageRichSummarySegment[],
  keys: Set<string>,
) {
  for (const segment of segments) {
    if (segment.kind === "mention") {
      keys.add(segment.key);
      continue;
    }
    if (segment.kind === "cluster" || segment.kind === "parens") {
      collectMentionKeysFromSegments(segment.segments, keys);
    }
  }
}

function validateMentions(
  mentions: Record<string, HomepageMention>,
  requiredKeys: string[],
): string | null {
  for (const key of requiredKeys) {
    if (!mentions[key]) return `Homepage mention ${key} is required`;
  }

  for (const [key, mention] of Object.entries(mentions)) {
    if (!isSafeMentionKey(key)) return `Homepage mention key ${key} is invalid`;
    const label = `Homepage mention ${key}`;
    const textError =
      validateTextField(
        mention.label,
        `${label} label`,
        HOMEPAGE_FIELD_LIMITS.mentionLabel,
        true,
      ) ??
      validateOptionalMentionText(label, "logoAlt", mention.logoAlt) ??
      validateOptionalMentionText(label, "badgeAlt", mention.badgeAlt) ??
      validateOptionalMentionText(label, "mark", mention.mark);
    if (textError) return textError;

    if (mention.href && !isSafeHomepageLink(mention.href)) {
      return `${label} link must start with / or https://`;
    }
    if (mention.logoSrc && !isSafeHomepageAssetPath(mention.logoSrc)) {
      return `${label} logo must stay under /images/`;
    }
    if (mention.badgeSrc && !isSafeHomepageAssetPath(mention.badgeSrc)) {
      return `${label} badge must stay under /images/`;
    }
  }

  return null;
}

function validateOptionalMentionText(
  label: string,
  field: string,
  value: string | undefined,
): string | null {
  return value === undefined
    ? null
    : validateTextField(
        value,
        `${label} ${field}`,
        HOMEPAGE_FIELD_LIMITS.mentionAsset,
        false,
      );
}

export function validateHomepageContent(content: HomepageContent): {
  ok: boolean;
  error?: string;
} {
  const { intro, past_work, latest_thoughts } = content.sections;

  const introError =
    validateSectionLabel(intro, "Homepage label") ??
    validateTextField(
      intro.heading,
      "Homepage heading",
      HOMEPAGE_FIELD_LIMITS.heading,
      intro.visible,
    ) ??
    validateTextField(
      intro.subheading ?? "",
      "Homepage summary",
      HOMEPAGE_FIELD_LIMITS.subheading,
      false,
    ) ??
    validateRichSummary(intro.rich_summary);
  if (introError) return { ok: false, error: introError };

  const mentionError = validateMentions(content.mentions, [
    ...collectRichSummaryMentionKeys(intro.rich_summary),
    ...(intro.mention_keys ?? []),
  ]);
  if (mentionError) return { ok: false, error: mentionError };

  const workError =
    validateSectionLabel(past_work, "Work label") ??
    validateSectionLink(past_work, "Work");
  if (workError) return { ok: false, error: workError };

  const writingError =
    validateSectionLabel(latest_thoughts, "Writing label") ??
    validateSectionLink(latest_thoughts, "Writing") ??
    (latest_thoughts.visible
      ? validateSlugList(latest_thoughts.writing_slugs ?? [], "Writing")
      : null);
  if (writingError) return { ok: false, error: writingError };

  return { ok: true };
}

export function normalizeHomepageContent(content: unknown): HomepageContent {
  const source =
    content && typeof content === "object"
      ? (content as Partial<HomepageContent>)
      : {};

  return {
    sections: {
      intro: normalizeSection(
        source.sections?.intro,
        DEFAULT_HOMEPAGE_CONTENT.sections.intro,
      ),
      past_work: normalizeSection(
        source.sections?.past_work,
        DEFAULT_HOMEPAGE_CONTENT.sections.past_work,
      ),
      latest_thoughts: normalizeSection(
        source.sections?.latest_thoughts,
        DEFAULT_HOMEPAGE_CONTENT.sections.latest_thoughts,
      ),
    },
    section_order: HOME_SECTION_ORDER,
    mentions: normalizeMentions(
      source.mentions,
      DEFAULT_HOMEPAGE_CONTENT.mentions,
    ),
  };
}

export function homepageSummaryText(content: HomepageContent): string {
  const intro = content.sections.intro;
  const subheading = intro.subheading?.trim();
  if (subheading) return inlinePlainText(subheading);

  const richSummary = intro.rich_summary ?? [];
  const plainText = richSummary
    .map((sentence) =>
      richSummaryPlainText(sentence.segments, content.mentions),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return (
    plainText ||
    DEFAULT_HOMEPAGE_CONTENT.sections.intro.subheading ||
    DEFAULT_HOMEPAGE_CONTENT.sections.intro.heading
  );
}
