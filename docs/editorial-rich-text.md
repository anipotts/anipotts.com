# Editing public text

Use `pnpm admin:preview:ensure`, then open `http://localhost:4311/content`.
Local edits save privately on this Mac. The **Live site** link opens production;
**Preview** renders the selected saved draft locally.

The Edit tab provides plain title fields and formatted introduction, subtitle,
and project-copy fields. Select text to apply bold, italic, or underline. Use
the link control to change a destination; edit its visible wording directly.
Select an inline image to replace its URL, change its description, or remove it.
Image descriptions may be blank for decorative logos beside a written name.
Use existing `/images/…` paths or HTTPS image URLs. Files are not uploaded by this
editor. Undo and redo remain available while editing, and History retains saved
revisions across reloads.

Formatted fields use inline Markdown in the canonical file. Underline uses paired
`<u>` tags. Raw HTML otherwise displays as text. Images support the optional title
values `white`, `wide`, and `mark` to retain existing brand presentation. The
homepage's first rich edit sets `subheading_format: markdown`; later edits never
restore links based on spelling. Search descriptions and feeds receive plain text.

Preview renders the actual homepage, or the actual card and article for writing
and project field edits. Listing pages preview their introduction; systems also
previews its workflow. Article-body changes remain editable in Source and need
source review; they are not rendered by the field preview.

After reviewing locally, release the editor and public renderer together. Download
the local draft, open the same record in production, and import it in Source.
Review the saved draft and its preview, then choose **Review changes → Approve
and publish**. That action sends the record to the public repository, runs required
checks, and publishes the checked change. Local publishing stays disabled.
