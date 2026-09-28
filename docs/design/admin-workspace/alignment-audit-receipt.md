# Admin alignment audit receipt

Date: September 28, 2026. PR: #457. Target: Astro admin only.

Ani requested an audit of vertical and horizontal alignment across every admin view, starting with the Records title, count, and Sample data badge. This receipt extends the shared record hierarchy review. The implementation keeps the established Quiet Precision typography, spacing, and component system.

## Findings and changes

| Surface                        | Observed relationship                                                                   | Final change                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Workspace and section headings | Smaller counts and badge text floated above the title baseline                          | Shared title clusters use text baseline alignment; controls retain their target sizes                |
| Record history                 | History count sat above its heading baseline                                            | Baseline alignment within the existing heading row                                                   |
| Source families                | Family labels and counts used a centered text cluster                                   | Baseline cluster with separately centered disclosure caret                                           |
| Knowledge standalone detail    | Back and clock squeezed a short title into multiple lines at 320px                      | Separate navigation and identity rows; natural title wrapping and common gutter                      |
| Knowledge split detail         | Close control and title consumed the same narrow title space                            | Shared header with scoped action placement                                                           |
| Project section actions        | Missing first/last movement actions shifted remove controls across rows                 | Fixed movement and remove slots with existing desktop/mobile target sizes                            |
| Project paragraphs             | Paragraph actions competed with long section labels                                     | Dedicated action row with wrapping                                                                   |
| Roadmap validation             | Wrapped error text pushed the selector away from its adjacent controls                  | Label, selector/actions, and error occupy explicit grid rows; accessible label/error wiring retained |
| Review heading and destination | Smaller detail text lacked a common first baseline                                      | Existing title and metadata clusters align on their text baseline                                    |
| Review field actions           | Multiple auto margins separated Edit and Full context                                   | One trailing action group                                                                            |
| Diff rows                      | Line numbers floated beside wrapped source text                                         | First-baseline alignment                                                                             |
| Publication progress           | Dot centered against a multi-line explanation                                           | Dot aligns with the first supporting text line                                                       |
| Observability mobile header    | Grid coordinates targeted the old direct heading child                                  | Coordinates now apply to the shared record heading wrapper                                           |
| Observability last success     | Success age centered against a multi-line budget warning                                | Baseline value cluster; explanation wraps below when necessary                                       |
| Observability timeline         | Bounded and prior-year timestamps crossed into state columns                            | Time cells wrap within their grid columns; state and duration share the first baseline               |
| Data record context            | Essential freshness, uncertainty, and assertion authority could fall inside All details | Reading context remains visible in the summary, with regression coverage                             |

The development-only component catalog contains wrapped section names, roadmap errors, publication verification, review context, and prior-year incidents. It uses synthetic data and in-memory outcomes. Its route is injected only during development and is absent from the production build.

## Browser coverage

Reviewed with Codex In-app Browser against the managed preview at `http://localhost:4311/`. The recorded route pass contains 197 snapshots across 93 unique route states, with additional interactive captures.

| Inventory                  | Coverage                                                                                                                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main navigation            | Overview; all four Content, four Data, and three Observability pages                                                                                                                                                               |
| Content records            | All 28 local records: five pages, seven writing records, 12 projects, four newsletters                                                                                                                                             |
| Data                       | All 18 synthetic records; optional details expanded; history and reading context                                                                                                                                                   |
| Knowledge                  | All eight synthetic entities; standalone and split detail                                                                                                                                                                          |
| Observability              | All 14 catalog entries and five alert selections; incident, changes, facts, and technical disclosure                                                                                                                               |
| Other routes               | New article and project editors, auth, and 404                                                                                                                                                                                     |
| Responsive coverage        | Inventory at 320px and 1280px; selected shared pages at 390px, 768px, 792px, and 1440px                                                                                                                                            |
| Expanded/edge states       | All source families and discovered accounts; health ranges and absent day; populated/empty record search; absent credentials; wrapped validation; full context, unified, and source diff; article properties; older timeline dates |
| Appearance and interaction | Dark/light theme; reduced motion; selector Escape/focus and existing native controls                                                                                                                                               |

No horizontal document overflow was measured in the recorded route pass. Final matched before/after captures use the same route, viewport, theme, and state. Local proof is retained under ignored `.local/alignment-proof/`, including `review.md`, `coverage.json`, and selected screenshots. The full capture inventory also remains in the task visualization directory.

A temporary development hydration warning during a hot update of the review title was resolved by keeping the existing wrapper markup and targeting its child in CSS. A fresh reload of the final markup produced no new console errors.

This audit covers the current route and fixture inventory, not every possible future content shape. It does not expose private production records, exercise real publication, prove 200% zoom, or establish production deployment or Ani's aesthetic acceptance.

## Verification and review

- `pnpm check:changed --working-tree`: passed after the final source edits, including affected formatting, lint, typecheck, build, route parity, fixture boundary, and tests. Admin: 1,801 unit/component tests, 42 Astro tests, and 73 worker tests passed. Content: 151 tests passed. Astro diagnostics reported zero errors, zero warnings, and 24 existing hints.
- Focused record, project, publication, review, and observability tests: 142 tests passed after the reading-context and initial incident fixes.
- Independent source review identified hidden assertion context and timestamp collisions. Both were repaired; the final source review reported no remaining actionable findings.
- Exact-head GitHub checks are tracked on PR #457 after the alignment commit is pushed; local success does not establish provider success.

No merge or production deployment is part of this receipt. PR #457 remains pending Ani's review. The managed preview stays running for continued visual review.
