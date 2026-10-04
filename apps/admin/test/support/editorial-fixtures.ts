/** Synthetic inputs only; never seed into production or reuse owner records. */
export const editorialFixtures = {
  longTitle: {
    id: "qa-long-title",
    title:
      "Synthetic editorial layout: a deliberately long title that wraps across several lines without clipping controls or pushing content outside a narrow viewport",
  },
  compactCopy: {
    id: "qa-compact-copy",
    title: "Synthetic compact layout",
    summary:
      "A full description that exercises readable wrapping and metadata placement beside the primary content.",
    cardCopy: "Short compact copy.",
  },
  formattedLinks: {
    id: "qa-formatted-links",
    markdown:
      '**Synthetic bold** and [linked copy](https://example.com/qa), with *emphasis* and an inline ![mark](/images/brand/structured-ai-mark.svg "white mark").',
  },
  saveRecovery: {
    id: "qa-save-recovery",
    title: "Synthetic recovered edit",
    failedSaveStatus: 503,
    failedSaveBody: { error: "synthetic_save_failure" },
  },
  publicationRecovery: {
    id: "qa-publication-recovery",
    operationId: "00000000-0000-4000-8000-000000000001",
    publishedBody: "Synthetic acknowledged publication.\n",
    subsequentBody: "Synthetic private edit after acknowledgement.\n",
  },
} as const;

/** Distinct revisions catch accidental clearing of edits made after publication starts. */
export function publicationRecoverySources() {
  const frontmatter =
    "---\ntitle: Synthetic publication recovery\nsummary: Synthetic regression fixture\nstatus: published\npublished_at: 2026-01-01\n---\n\n";
  return {
    acknowledged:
      frontmatter + editorialFixtures.publicationRecovery.publishedBody,
    newerPrivate:
      frontmatter + editorialFixtures.publicationRecovery.subsequentBody,
  };
}
