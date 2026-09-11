# Goal: improve admin through real editorial work

## Objective

Make admin.anipotts.com a clean, conventional, professional place for Ani to
create, revise, preview, and maintain his writing. Use the actual editorial
workflow to discover and fix friction, rather than treating visual polish as
completion. Continue the Astryx consistency work and its remaining live QA.

## Dogfooding work

- Create and maintain the September 10 OpenAI GPT-6 hackathon article through
  the admin interface, using Ani's September 11 dictation and original photo.
  Keep proposed wording identifiable as unreviewed. Preserve the original
  photograph and use a faithful crop; exclude reconstructed image previews.
- Develop the article from Ani's actual observations about visualizations,
  interactive models, the office mission display, presentations, and his
  conversation with a Caltech researcher working on Lean. Verify external
  claims and attribute OpenAI's Navier–Stokes announcement accurately. Do not
  invent the researcher's identity, involvement, quotes, or Ani's conclusions.
- Review every existing writing record through admin. Inventory its current
  public/private status, content, formatting, media, links, preview, and editing
  limitations. Preserve published visibility unless Ani has requested otherwise.
- Keep “jpegmafia is our kanye west” hidden/unpublished. Retain its source and
  private draft. Do not delete it or publish it as part of testing.
- Prepare revisions to previous posts as recoverable private drafts. Fix clear
  typos, broken formatting, and confirmed errors; preserve Ani's voice and
  meaning. Ask one focused question when a substantive change needs his intent.
  Do not apply a generic rewrite across his writing.
- If another record's intended visibility is uncertain, preserve its existing
  state and record the specific decision needed rather than guessing.

## Interface work

- Support creating a new article, discovering private drafts, and reopening
  them reliably without requiring filesystem editing.
- Design around content type: a readable article body, title and summary,
  contextual formatting controls, image/link editing, and compact article
  settings. Keep one clear primary action and secondary actions in predictable
  places. Avoid repetitive helper text and unnecessary dialogs.
- Use installed Astryx components and theme tokens consistently. Preserve
  autosave, revision history, conflicts, recovery, unsaved-navigation protection,
  and the existing publication approval stages.
- Preview the actual edited body. Preserve unsupported Markdown/HTML without
  silent conversion loss. Make any limitation visible and actionable.
- Improve the interface as real use exposes problems. Test each change in the
  workflow that motivated it, including appropriate empty, loading, failure,
  validation, retry, and duplicate-submission states.

## Validation and release

- Use the Browser plugin and the user's admin interface for dogfooding. Use the
  managed localhost:4311 preview for implementation QA; leave it running.
- Check desktop, tablet and mobile layouts, light/dark themes, reduced motion,
  keyboard operation, focus restoration, touch targets, overflow, and console
  errors. Verify drafts survive reloads and navigation.
- Review all changed code and data-preservation behavior. Run affected tests,
  type checks, builds, formatting and repository checks. Fix failures and
  repeat the checks justified by changes.
- Release checked interface changes through a focused protected PR. Verify live
  protections and exact-head checks before merge. Inspect deployment scope and
  avoid unrelated worker deployments. Record PR, release SHA, deployment run,
  affected targets and live behavior.
- Content publication remains a separate deliberate editorial action. Do not
  publish the hackathon draft or revisions merely to test the UI. Prepare the
  exact reviewable content before requesting any required final publication
  approval.

## Completion

Completion requires the hackathon draft available in admin; every previous
writing record audited with its intended visibility preserved or clarified;
reviewable private revisions where appropriate; tested interface improvements
deployed and verified live; and a concise record of remaining content questions
or concrete limitations. Report local, private-draft, deployed-interface and
public-content outcomes separately. Leave the browser in its normal viewport.
