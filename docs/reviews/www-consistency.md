# www consistency plan

Keep the approved wave identity and existing Instrument Sans/display pairing. Use the current light paper #f7faff, dark paper #151b26, light ink #0e2034, dark ink #eff4fc, accent #1247e6/light and #61abea/dark. Preserve readable article layouts and brand logos.

Typography: display titles 900; control labels 500; status labels 600; prose and timeframe values 400. Compact controls share 0.8rem size, 1.25 line height and 1rem icons. Plain navigation retains its quieter presentation but shares its icon gap and focus behavior.

Spacing: one responsive card inset; a shared content gap and header gap; shared image-to-header spacing. Actions and status/timeframe badges share padding, radius, border and translucent paper, with semantic differences in weight and minimum target size preserved.

Layout:
[ title allowed to wrap ] [ icon | action | curved arrow ]
[ description ]
[ status | timeframe ]

Full-card anchors retain one focus target. Writing rows retain an editorial layout but share title weights, insets, copy rhythm and interaction behavior. Gallery choices/viewer actions and article topic chips use the compact control system. No changes to publishing, APIs, private content or production bindings.

Interactions: stable card surface, no lift; accent action on hover/focus; visible high-contrast focus ring; reduced motion preserved. Shared waves remain the single expressive element.

Verification: build, typecheck, existing runtime/public contract tests, formatting; all rendered public routes across 320/390/768/1024/1440 widths, both themes; breakpoint boundaries for headers and grids; keyboard focus, media gallery/viewer, nav/menu, reduced-motion and overflow. Review screenshots grouped by page/layout, including long titles and descriptions. Preserve original review artifacts and report exact coverage rather than claiming every possible device.

## implementation and verification

The final spacing revision uses `clamp(1rem, 2vw, 1.5rem)` for card insets, a fixed `0.875rem` content gap, and a `0.75rem` header gap. Desktop card titles use a 1.5rem to 1.625rem scale from 1024px; smaller layouts retain the responsive title scale. Removed arbitrary card/body minimum heights. Matching media windows preserve 16:9 framing with the same horizontal inset as card text. Status groups align at the bottom of equal-height grid cards.

The press row joins the shared wave composition. Experience screenshots have no separate shaded surface or window shadow. Actions, metadata badges, topic chips and viewer controls share compact control tokens. Card links remain single anchors with a visual action in the header. The PGI project mark now adapts to light and dark themes.

Local checks passed: www build and typecheck, all 139 www tests, and `pnpm check:changed --working-tree`. Browser checks covered 22 rendered fixture pages at 320, 390, 640, 720, 721, 768, 800, 801, 1024 and 1440 CSS pixels in both themes: 440 combinations. Checks cover horizontal overflow, mobile greeting fit, action bounds and 44px target height, nested controls and real broken images. Screenshot review covers all 22 pages at 320, 768 and 1440 in both themes. Captures use reduced motion and expose entrance-animation content for review only; temporary capture styles are absent from source.

Interaction checks passed for mobile menu open/Escape close, visible keyboard card focus, and image enlarge/zoom/close at 390, 768 and 1440 in both themes. Current content has separate single-image stages, so multi-item gallery selection was not claimed as tested. The local preview renders actual compiled www Worker output with fixture content; it does not attest to every production CMS record or every possible device.

## integration boundary

Accepted card work in PR #463 merged as `fb8db4d839d2eab86ab50ba4d6b3ad14e20cdddd`. Exact-head CI run 36800824172 passed. Deploy run [36801232394](https://github.com/anipotts/anipotts.com/actions/runs/36801232394) passed www and admin, with worker targets skipped; the live public root contained the new press row and actions. This consistency revision is a separate branch awaiting Ani's visual acceptance. The website chat retains ownership of admin PRs #461 and #464; neither was included in this public-site change.

## follow-up visual revision

The `agents` repository and route keep their names; WorkCard, WorkDetail and the guide highlight display `coding agent tips`. The guide highlight now uses a brand mark, title and supporting copy with an action aligned right, then a full-width action below 600px. The Business Insider component remains unchanged.

Writing rows use a compact grid with aligned right-side dates and arrows above 600px. On mobile, dates sit directly below titles and summaries follow with a smaller shared row gap. The footer keeps its stacked contact text on the left and seven icons on the right in one row. Below 720px horizontal targets become 28px and below 420px 24px, while retaining 44px height; smaller contact type makes the seven-link row fit at 320px. NYU purity test, Quantercise and PGI action marks use 1.35rem instead of 1rem, preserving the shared text and arrow scale.

Affected checks passed again after these changes. The writing, guide, naming and footer revision passed all 440 browser combinations, including single-row footer bounds and all seven visible links. Final icon checks cover the four affected page layouts at all ten widths and both themes. Visual evidence remains local and is not production CMS acceptance.
