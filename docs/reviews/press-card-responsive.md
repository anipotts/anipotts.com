# Responsive homepage press card

The dedicated press card replaces the plain reporting links. It uses the
publisher's official stacked wordmark, the site's existing curved arrow icon,
and the experience cards' shared padding, surface, radius and shadow.

The card says "read my feature in a story about coding agent limits" and links to the
original reporting and the published essay. Each link starts with its existing
BI or ap favicon, matching the paragraph's inline identity treatment. The essay link follows its CMS
record identity and current slug, and disappears when the essay is unpublished.

Logo source:
[Business Insider stacked wordmark](https://www.businessinsider.com/public/assets/logos/stacked-black.svg),
localized on September 30, 2026. Dark mode adapts its contrast.

## Homepage copy

Ani requested removing the duplicate Business Insider sentence from the hero.
The canonical homepage seed now ends at "an atlantic records venture." The
remaining bio wording is unchanged. Shorter alternatives are review previews,
not source changes.

Production homepage CMS content overrides this seed. A code deployment alone
will not remove the sentence from the published paragraph. Before a separately
approved CMS publication, inspect the latest `home` revision, remove only this
sentence from `sections.intro.subheading` if still present, and remove
`businessInsider` from `sections.intro.mention_keys` while preserving unrelated
edits:

> business insider also wrote about how i use coding agents in my everyday work under usage constraints.

Keep the previous published revision for recovery. No remote database seed,
migration or production CMS write is part of this implementation.

## Validation

Scoped build, lint, typecheck, public contracts and unit tests cover the change.
Runtime coverage verifies the essay's slug change and unpublication. Browser
review uses compiled Worker output rendered with a synthetic local content
store, never production admin records.

Screenshots are local review artifacts under `output/playwright/`. Browser
geometry checks cover 320, 375, 390, 480, 640, 768, 800, 801, 1024 and 1440 pixels,
matching press-card outer edges and inset padding to the experience cards.
Check overflow, content bounds, 44-pixel link targets, keyboard focus and dark
mode on the final head before integration.

## Responsive action row

Desktop keeps the logo, copy and actions in one compact row. At the existing
800-pixel breakpoint, the logo and copy form a centered header above two equal
width actions spanning the full card interior. Each action uses a subtle theme
surface, a leading BI or ap mark, left-aligned text and the same curved arrow
aligned to its right edge. A single remaining action fills the available row.

The existing 480-pixel and 359-pixel treatments reduce mark sizing and spacing.
Labels wrap naturally at the smallest widths while preserving 44-pixel touch
height. The card retains the experience cards' shared insets and radius. No
fixed card height or viewport-specific copy is introduced.

## shared www card actions

Experience, work and guide cards use the same filled icon, label and curved-arrow treatment as the press actions. `CardAction` supplies a non-interactive visual action inside each existing whole-card link, avoiding nested links and duplicate keyboard targets. Project marks move from the title into the action, aligned at the right of the header row. Actions and status/timeframe badges share radius, padding, translucent surface and border tokens. The homepage, work index and editorial card previews inherit the shared components. Writing rows retain their existing presentation.

The homepage greeting stays on one line through the existing 640px mobile breakpoint, with a dedicated 10.5vw display token. No fixed minimum font size causes narrow-screen overflow. The full name and copy remain unchanged.

Verified www build and typecheck, all 139 www tests, and browser checks at 320, 375, 390, 640, 768 and 1440px. The homepage and work index actions fit their cards, preserve 44px minimum height, and contain no nested links. Mobile greeting text fits on one line without horizontal overflow. Local screenshots live under `output/playwright/actions-*`; production is unchanged.

## continuous card surfaces

The press row participates in the existing shared wave composition, with the same light and dark paper and wave palette as the work cards. Content sits above the decorative layer. The two featured experience screenshots no longer cast a shadow into a clipped media section. Their media-to-header spacing is reduced, and text and media now share the horizontal inset. The screenshot pixels and outer card shadow are unchanged.
