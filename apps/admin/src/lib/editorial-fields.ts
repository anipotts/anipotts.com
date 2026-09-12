import type { EditorialRecord } from "@anipotts/content/editorial/source";
export type EditorialField = {
  label: string;
  path: string[];
  rich?: boolean;
  description?: string;
};
export function editorialFields(
  record: EditorialRecord,
  data?: unknown,
): EditorialField[] {
  if (record.kind === "writing")
    return [
      { label: "Title", path: ["title"] },
      {
        label: "Subtitle",
        path: ["summary"],
        rich: true,
        description: "Shown on writing cards and beneath the article title.",
      },
    ];
  if (record.kind === "work") {
    const fields: EditorialField[] = [
      { label: "Title", path: ["title"] },
      { label: "Subtitle", path: ["subtitle"], rich: true },
      {
        label: "Card copy",
        path: ["card_copy"],
        rich: true,
        description:
          "A short introduction for project cards. Up to 180 visible characters.",
      },
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
        rich: true,
        description:
          "Your homepage introduction. Edit the words directly; links and logos stay attached.",
      },
      { label: "Work section label", path: ["sections", "past_work", "label"] },
      {
        label: "Writing section label",
        path: ["sections", "latest_thoughts", "label"],
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
