# Responsive homepage press card

The dedicated press card replaces the plain reporting links. It uses the
publisher's official stacked wordmark, the site's existing curved arrow icon,
and the experience cards' shared padding, surface, radius and shadow.

The card says "featured in a story about coding agent limits" and links to the
original reporting and the published essay. The essay link follows its CMS
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
