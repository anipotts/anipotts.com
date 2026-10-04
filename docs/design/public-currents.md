# public currents

The blue flowing geometry on anipotts.com comes from three separate pieces.
Only the card currents move.

## where it moves

Card currents are one document-wide composition. Every card with an
`AmbientFlow` crops its own window of it, so a band leaving one card continues
into the next. `apps/www/src/lib/shared-currents.ts` draws them.

| surface       | component                            | where it appears                                           |
| ------------- | ------------------------------------ | ---------------------------------------------------------- |
| press feature | `PressMention` (own 600 by 320 crop) | home                                                       |
| featured work | `ExperienceFeatureCard`              | home                                                       |
| work card     | `WorkCard`                           | home work list, `/work`, editor card preview               |
| writing card  | `WritingRow`                         | home writing list, `/writing`, more writing under articles |
| guide card    | `CodingAgentTipsCard`                | home                                                       |

Motion on these cards:

- **pour**: the first time a route is shown in a tab, each card's bands wait
  just below the card and rise into place as whole, filled flows when the card
  scrolls into view. Reloads, back and forward, routes already seen in the tab
  and the writing card morph start settled. There is no fade.
- **tide**: the idle swell. Bands breathe and their stripes slide past each
  other, drawn at 30 frames a second.
- **scroll push**: scrolling moves the large crests, eased so the current
  coasts to rest. The push is measured in px of edge travel per px scrolled,
  so a short homepage and a long listing feel the same.
- **reduced motion**: `prefers-reduced-motion` turns all of it off and draws
  one still frame.

Below 1024px the cards stack into one column, so phones and tablets use a
calmer tuning: smaller swell, half the push, a shorter pour, and 30 frames a
second while scrolling.

## where it stays still

| surface              | component         | where it appears                                                                                       |
| -------------------- | ----------------- | ------------------------------------------------------------------------------------------------------ |
| page bands           | `PageCurrent`     | behind home, `/work`, `/writing`, `/systems`, `/business`, `/links` and 404                            |
| article header waves | `DetailWaves`     | top of `/work/[slug]` and `/writing/[slug]`; the writing header morphs from its card on open and close |
| social cards         | `lib/social-card` | generated Open Graph images                                                                            |

Nav, footer, article bodies and Admin carry no currents.

## tuning

Run `pnpm dev:www` and open any page with `?motion`. A dev-only panel edits
the live desktop and compact values, replays the pour, and outlines every
surface: pink for moving currents, teal for still geometry. `copy` puts the
values on the clipboard for `shared-currents.ts`. `?motion=off` closes it for
the tab. Production builds do not include the panel.
