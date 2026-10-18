import type { EditorialRecord } from "@anipotts/content/editorial/record";
import {
  navItems,
  siteConfig,
  siteLinks,
  footerProfileDefaults,
} from "@anipotts/content/public/site";
export type EditorialField = {
  label: string;
  defaultValue?: string;
  group?: string;
  path: string[];
  rich?: boolean;
  /** Explicit per-field markdown marker for source-preserving rich edits. */
  formatPath?: string[];
  /** Legacy homepage mentions belong only to the field that opts into them. */
  mentionKeysPath?: string[];
  /** Visible characters the field allows; its counter shows near the end. */
  limit?: number;
};
export function editorialFields(
  record: EditorialRecord,
  data?: unknown,
): EditorialField[] {
  if (record.kind === "writing")
    return [
      { label: "Title", path: ["title"] },
      { label: "Subtitle", path: ["summary"], rich: true },
      { label: "Opening note", path: ["opening"] },
    ];
  if (record.kind === "work") {
    const fields: EditorialField[] = [
      { label: "Title", path: ["title"] },
      { label: "Card title", path: ["card_title"] },
      {
        label: "Compact card copy",
        path: ["card_copy_compact"],
        rich: true,
        limit: 180,
      },
      { label: "Subtitle", path: ["subtitle"], rich: true },
      { label: "Card copy", path: ["card_copy"], rich: true, limit: 180 },
      { label: "Description", path: ["description"], rich: true },
    ];
    const content =
      data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    for (const name of ["story", "technical"] as const) {
      const sections = content[name];
      if (!Array.isArray(sections)) continue;
      sections.forEach((section: unknown, index: number) => {
        if (!section || typeof section !== "object") return;
        const entry = section as Record<string, unknown>;
        const prefix = `${name === "story" ? "Story" : "Technical section"} ${index + 1}`;
        fields.push({
          label: `${prefix} heading`,
          path: [name, String(index), "title"],
        });
        if (name === "technical")
          fields.push({
            label: `${prefix} text`,
            path: [name, String(index), "content"],
            rich: true,
          });
        else if (Array.isArray(entry.paragraphs))
          entry.paragraphs.forEach(
            (paragraph: unknown, paragraphIndex: number) => {
              if (typeof paragraph === "string")
                fields.push({
                  label: `${prefix}, paragraph ${paragraphIndex + 1}`,
                  path: [
                    name,
                    String(index),
                    "paragraphs",
                    String(paragraphIndex),
                  ],
                  rich: true,
                });
            },
          );
      });
    }
    return fields;
  }
  if (record.id === "home")
    return [
      { label: "Heading", path: ["sections", "intro", "heading"] },
      {
        label: "Subheading",
        path: ["sections", "intro", "subheading"],
        formatPath: ["sections", "intro", "subheading_format"],
        mentionKeysPath: ["sections", "intro", "mention_keys"],
        rich: true,
      },
      {
        label: "Compact subheading",
        path: ["sections", "intro", "subheading_compact"],
        formatPath: ["sections", "intro", "subheading_compact_format"],
        rich: true,
      },
      { label: "Work section label", path: ["sections", "past_work", "label"] },
      {
        label: "Writing section label",
        path: ["sections", "latest_thoughts", "label"],
      },
      ...navItems.map((item, index) => ({
        label: `${item.name[0]!.toUpperCase()}${item.name.slice(1)} navigation label`,
        path: ["site_settings", "navigation", item.name],
        defaultValue: item.name,
        ...(index === 0 ? { group: "Shared navigation" } : {}),
      })),
      {
        label: "Footer prompt",
        path: ["site_settings", "footer", "prompt"],
        defaultValue: "have a question?",
        group: "Shared footer",
      },
      ...Object.entries(footerProfileDefaults).flatMap(([key, link]) => [
        {
          label: `${link.title} label`,
          path: ["site_settings", "footer", "profiles", key, "label"],
          defaultValue: link.label,
        },
        {
          label: `${link.title} URL`,
          path: ["site_settings", "footer", "profiles", key, "href"],
          defaultValue: link.href,
        },
      ]),
      {
        label: "RSS label",
        path: ["site_settings", "footer", "rss_label"],
        defaultValue: siteLinks.rss.label,
      },
      {
        label: "Admin link label",
        path: ["site_settings", "footer", "admin_label"],
        defaultValue: siteLinks.admin.label,
      },
      {
        label: "Homepage search title",
        path: ["site_settings", "seo", "homepage_title"],
        defaultValue: siteConfig.homepageTitle,
        group: "Shared search and feeds",
      },
      {
        label: "Homepage search description",
        path: ["site_settings", "seo", "description"],
        defaultValue: siteConfig.description,
      },
      {
        label: "Search title suffix",
        path: ["site_settings", "seo", "title_suffix"],
        defaultValue: siteConfig.displayName,
      },
      {
        label: "Feed description",
        path: ["site_settings", "seo", "feed_description"],
        defaultValue: siteConfig.feedDescription,
      },
    ];
  if (record.id === "newsletter")
    return [
      ["headline", "Headline"],
      ["deck", "Deck"],
      ["cta_label", "CTA label"],
      ["success_message", "Success message"],
      ["error_message", "Error message"],
      ["footer_text", "Footer text"],
      ["archive_label", "Archive label"],
      ["archive_copy", "Archive copy"],
      ["archive_link_label", "Archive link label"],
    ].map(([key, label]) => ({ label: label!, path: [key!] }));
  const fields: EditorialField[] = [
    { label: "Heading", path: ["hero_title"] },
    { label: "Introduction", path: ["hero_summary"], rich: true },
    {
      label: "Compact introduction",
      path: ["hero_summary_compact"],
      rich: true,
    },
    { label: "Search title", path: ["title"] },
    { label: "Search description", path: ["description"] },
  ];
  if (record.id === "systems")
    fields.push(
      {
        label: "Workflow introduction",
        path: ["workflow", "intro"],
        rich: true,
      },
      {
        label: "Workflow closing text",
        path: ["workflow", "outro"],
        rich: true,
      },
      { label: "Feedback note", path: ["workflow", "feedback"], rich: true },
      ...Array.from({ length: 4 }, (_, i) => [
        {
          label: `Step ${i + 1} label`,
          path: ["workflow", "steps", String(i), "label"],
        },
        {
          label: `Step ${i + 1} detail`,
          path: ["workflow", "steps", String(i), "detail"],
          rich: true,
        },
      ]).flat(),
    );
  return fields;
}
