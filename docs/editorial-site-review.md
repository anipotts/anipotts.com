# Writing and work review

Snapshot: September 8, 2026. Content baseline: `adb74ec`.

This is the working editorial map for the writing and work detail redesign.
It records coverage and open questions; it does not approve replacement copy.
Earlier files `site-release-review-2026-09-07.md` and
`public-site-review-batch-2026-08-28.md` are release receipts, not an active
article-by-article writing ledger.

## Scope and evidence

- The live sitemap was read on September 8: five published articles and eleven
  public work details. The options-pricing entry is still in that live snapshot,
  but Ani explicitly requested its removal from every public listing, including
  the archive. The intended work inventory below has ten entries.
- Sources: `content/public/writing/*.md`, `content/public/projects/*.md`,
  `apps/www/src/lib/content.ts`, and
  `packages/content/src/public/visibility.ts`. Writing routes select
  `status: published`; work routes select `public_state: featured` or `listed`.
  Draft/hidden records return 404 through the current route handlers.
- Word counts are approximate whitespace counts of existing prose, not a target
  length or quality measure. Work counts distinguish Markdown body, structured
  story paragraphs, technical paragraphs, and the description fallback.
- All existing prose has **unresolved authorship** at the span level. Publication,
  frontmatter, first person, and repository history alone establish neither Ani's
  authorship nor wording acceptance. Treat it as material to review, not positive
  voice evidence. This audit did not inspect message history or establish claim
  provenance.
- Ani's September 8 instructions and dictation below are direct user evidence.
  Their eventual prose adaptations will be agent proposals until reviewed.
- **Current wording review boundary:** inventory only. No existing article or work
  narrative has been rewritten or accepted in this pass. No expansion or new
  article is publication-ready.

## Shared presentation direction

**Covered by Ani's direction:** writing-page option 3; readable spacing around
year ranges; one consistent typography/theme system; a wave-shaped header boundary
that flows into the article instead of ending on a straight edge. A stable unique
composition per page is acceptable. Headers should occupy an intentional fraction
of the viewport, with responsive reading width and comfortable long-form type.

Writing should feel personal and exploratory. Work should explain the actual job,
constraints, decisions, implementation, and outcome with focused evidence. They
share components and tokens without forcing identical layouts or a mandatory
section formula. Add room for captioned images, video/GIF demonstrations, source
links, code, and optional isolated interactive demonstrations. Longer prose is
useful where it carries real experience, not where it pads a page.

Preserve raw supplied material and provenance before a substantial rewrite.
Review on mobile, tablet, desktop, both themes, keyboard navigation and reduced
motion. Keep source and external-media captions meaningful; a link is not proof
that Ani endorses a product or made a particular decision.

## Published writing inventory

All five have **zero body images and zero video/iframe embeds** at this snapshot.
All five need a voice interview/review before a first-person expansion.

| Article / route                                                                                          | Published date |      Body | Existing material                                                                               | Priority and next gap                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------- | -------------- | --------: | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| awareness is alpha · `/writing/awareness-is-alpha`                                                       | Jul 14, 2026   | 362 words | Eight paragraphs; one Business Insider link                                                     | P1. **Needs Ani:** a concrete recent moment that made awareness matter, what the title means to him, and what he would actually tell a friend. **Needs research:** source attribution for the linked interview and any workflow evidence he chooses to cite. The prediction about the next two years is an opinion to confirm, not a verified fact. |
| saturdays are for claude code · `/writing/saturdays-are-for-claude-code`                                 | Apr 13, 2026   | 478 words | Three H2 sections; Business Insider artifact and body link; internal systems/monitor/todo links | P1. **Needs Ani:** the actual reporter interaction, how limits affected his routine then, and what changed since. **Needs research:** article quotations and numerical session claims listed below. Separate a dated personal report from advice about today's tools.                                                                               |
| i built a monitor for my claude code sessions · `/writing/i-built-a-monitor-for-my-claude-code-sessions` | Apr 7, 2026    | 443 words | Unsectioned narrative; inline path/code; promised future recordings                             | P1. **Needs Ani:** what Claudemon actually showed, why he cared, an observed useful or misleading signal, and current project status. **Needs research:** repo/version/demo evidence for instrumentation and claimed patterns; locate a usable recording.                                                                                           |
| stop ending your day with "fix the bug" · `/writing/stop-ending-your-day-with-fix-the-bug`               | Apr 7, 2026    | 364 words | Narrative with auth and dark-mode prompt examples; no supporting artifacts                      | P2. **Needs Ani:** one real handoff and what happened the next day; identify whether current examples are real, illustrative, or agent-written. **Needs research:** any measured tool-call/time comparison that he wants to retain.                                                                                                                 |
| search will be dead by 2030 · `/writing/search-will-be-dead-by-2030`                                     | Jan 31, 2026   |  69 words | Short thesis, two three-item lists, concluding prediction                                       | P2. **Needs Ani:** what "search" and "dead" mean, what he already does differently, and where the prediction might fail. **Needs research:** chosen current examples and their limits. Do not expand the title into a stronger belief than he holds.                                                                                                |

Specific unsupported numerical/causal claims to resolve before reusing them:

- **Saturdays:** 31-minute median; 15 active minutes; 3.3 tool calls/minute;
  8.8× wall-time drop; "100% human idle time"; more than half of hour-long
  sessions compacting; 1,000+ hours; 600+ sessions; five concurrent weekly
  sessions. Establish the dataset, time window, definitions, computation and
  authorship. Current tool behavior should not be inferred from those historical
  figures. Claims that pauses always catch an issue and patterns produce better
  code also need his intended scope.
- **Monitor:** cost correlating more with context than complexity; reads/writes
  diagnosing session health; prompt changes following burst patterns. Distinguish
  Ani's observed example from a general performance claim. Confirm whether token,
  cost and tool activity were actually available across the devices named.
- **Todos:** "10x worse," 30+ versus fewer than ten tool calls, two minutes of
  preparation saving ten minutes, and exact auth-file/line details. Keep as
  illustrative only if Ani identifies them that way; do not backfill evidence.
- **Awareness/search:** broad forecasts and confident universal claims need a
  clear personal stance, examples, uncertainty and counterexamples where Ani
  thinks they matter. Evidence can test a claim without supplying his opinion.

## Unpublished writing

| Record                                                                                | State                                      |               Body | Next step                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------ | -----------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| jpegmafia is our kanye west · `content/public/writing/jpegmafia-is-our-kanye-west.md` | Draft; not a public route or sitemap entry | 87 words; no media | **Needs Ani:** determine whether the actual intended piece is about music, a cultural comparison, product taste, or something else. The current product/execution framing is not confirmed voice evidence. Preserve draft; do not publish or complete its outline automatically. |

## Work inventory after the requested removal

Listed state and product status are separate. For example, an archived product
can still have a public work page. Each route below is under `/work/` and its source
file is `content/public/projects/<slug>.md`.

| Project / slug                                       | Public state; status                  | Current prose                                     | Media                                                       | Priority and coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| structured ai · `structured-ai`                      | featured; archived experience         | 72-word body                                      | One drawing/chat image                                      | P1. Ani identifies this as his biggest experience and wants a detailed account of what he actually did. Build around a specific interaction/design problem, his responsibility, constraints and outcome. **Needs Ani:** ownership boundaries, chronology and decisions he wants to explain. **Needs research:** source support for role, dates, company label and any product claims; confirm which material can be shown publicly.                                                              |
| paragon global investments · `pgi-research-platform` | featured; live experience             | Four story sections, 212 words; no Markdown body  | Four images: directory, resources, content admin, analytics | P1. Ani rejects the current copy and distant whole-page screenshots as sufficient explanation. Focus on requirements, data model, role-scoped navigation, individual member/education/research tasks and officer CMS maintenance. **Needs Ani:** actual requirements and decision history. **Needs research:** actual schema, roles, resource management flows, source UI and sanitized examples. Current "300+ members," "couple of days" and infrastructure/permissions claims are unresolved. |
| quantercise · `quantercise`                          | featured; live project                | 26-word body + four technical sections, 122 words | None                                                        | P2. Explain the practice loop and the design choices that matter to someone solving a problem. **Needs Ani:** what he wanted while preparing, why the loop changed and which version to represent. **Needs research:** current deployed version versus historical stack; 400+ problems, grading types, Lambda isolation, payments, editor/math implementation and gamification claims. Do not merge legacy and successor behavior.                                                               |
| coding agent tips · `claude-code-tips`               | featured; live project                | No body; 27-word description fallback             | None                                                        | P2. Explain the actual purpose and how he uses/maintains the handbook, with selected component or page evidence. **Needs Ani:** what he wants this project page to add beyond the guide itself. **Needs research:** source repo/current content and the "hundreds of sessions" claim. Use accepted writing from the handbook only with provenance.                                                                                                                                               |
| imessage mcp · `imessage-mcp`                        | featured; live project                | No body; 25-word description fallback             | None                                                        | P2, deliberately concise. A real local-message question, the tool response and the useful boundary may be enough. **Needs Ani:** the motivating use and what he considers worth showing. **Needs research:** package/repo capabilities and read-only/data-location claims. Demonstrations must use synthetic or explicitly publishable messages, not private study samples.                                                                                                                      |
| nyu purity test · `nyu-purity-test`                  | featured; live project                | No body; 28-word description fallback             | None                                                        | P2, deliberately concise. Show the quiz/share flow and the specific story of its circulation. **Needs Ani:** what he made in the night and what he remembers of the response. **Needs research:** 1,000+ completions in under 17 hours and 200k+ visits, with date and metric definitions.                                                                                                                                                                                                       |
| chainedchat · `chainedchat`                          | listed; archived project              | No body; 30-word description fallback             | None                                                        | P2. Ani's "Chat" may refer to this record; confirm the naming before changing it. Focus on the composer UI/UX and why its interactions interested him. **Needs Ani:** recordings/screenshots he mentioned and intended interaction sequence. **Needs research:** original repo/version, routing/context/billing claims and asset dates. Do not claim influence on later products from visual similarity.                                                                                         |
| our bad habit · `habittracker-obh`                   | featured; live experience             | No body; 25-word description fallback             | None                                                        | P2, limited expansion. Ani identifies a Streamlit app and prefers one or two images demonstrating an expected flow. **Needs Ani:** one actual scouting task, his role and what was used. **Needs research:** named data sources, geo-discovery capability, dates and selected safe demo assets.                                                                                                                                                                                                  |
| range media partners · `range-media-partners`        | featured; work-in-progress experience | 10-word body                                      | None                                                        | P3. Current record says client A&R research; Ani describes a first paid software gig called Mattracks and a conversation with Matt Nadler, but the relationship between those facts and this record is unresolved. **Needs Ani:** exact naming/scope and whether it deserves a page. **Needs research:** bounded Matt Nadler conversation as authorized, plus available project evidence. Do not merge clients or invent a success story.                                                        |
| mental math extension · `quantercise-extension`      | listed; archived project              | No body; 24-word description fallback             | None                                                        | P3. Not specifically expanded in the latest dictation. **Needs Ani:** whether it merits its own concise page or should be discussed alongside Quantercise. **Needs research:** source/browser flow, keyboard/sound/progress features and archive status.                                                                                                                                                                                                                                         |

## Excluded records and cleanup

- **options pricing + sensitivity analysis** (`options-pricing-sensitivity`): Ani
  explicitly requested no public visibility, even in the archive. Current source
  at this inventory snapshot is `listed`; live sitemap still includes it. Parent
  implementation owns hiding the record, removing listing/search/sitemap exposure
  and verifying the direct route returns 404. Keep the source recoverable. This
  is a removal request, not material for an expanded portfolio story.
- **saeshify** (`saeshify`): already hidden, no body, no published route. Do not
  promote it or propose a public rewrite without a new selection from Ani.

## Direct dictation already covered

Source for this section: Ani's long September 8 request in the current task.
These are intent and user-reported recollections, not independently verified
external facts or accepted final prose.

- Personal writing should sound like his serious, genuine longer messages. He
  wants casual personal-site writing with his real intensity, digressions and
  detail, not a generic formal register. He requested a bounded study of his own
  outgoing messages and explicit global persistence of useful voice guidance.
  Conclusions from that study remain tentative until checked against his edits;
  private life facts and correspondents' text should not enter public drafts.
- He wants images, references, videos and small specific ideas captured where
  they help explain his thinking. He wants longer accounts but has not provided
  every article's meaning yet.
- Structured AI is his biggest experience. Its sparse page is a priority.
- PGI should show how the platform was designed and built: functional and
  non-functional requirements, models, navigation scoped to users, UI choices,
  and a section on officers/admins adding, editing, removing and updating
  educational resources and pitch/directory material. Google Docs, slides and
  spreadsheets were named as resource types he wants discussed. These are his
  desired topics; verify the actual implemented flows before describing them.
- For PGI he prefers focused crops or responsive isolated UI demonstrations over
  a gallery of distant full-screen screenshots. For example, a portion of the
  sidebar can introduce the site's areas and permissions before individual flows.
- Mattracks was, in his recollection, his first paid software gig; it was not
  consistently successful and may not warrant substantial space. He corrected
  the contact name to Matt Nadler and authorized reading that conversation for
  context. Relationship to the Range record remains open.
- Our Bad Habit needs a concise Streamlit example flow, perhaps one or two images.
- Chat's composer was the part he found most interesting. He has older screenshots
  and recordings he may supply. The discussion of contemporary agent composers
  supplies comparison context, not proof of historical influence.
- NYU Purity Test and imessage-mcp have straightforward purposes and should remain
  proportionately short. Options-pricing should disappear from public view.

## Interview order and review method

Prepare independent article research and inventories in parallel, then ask one
focused, dictation-friendly question at a time. Do not send a questionnaire or
write five invented first-person narratives in parallel. Choose the most
important unanswered meaning gap, preserve the raw answer, then offer one
candidate polish of the grounded section. Keep each candidate unreviewed until
Ani responds. Length follows useful coverage rather than a word-count quota.

Suggested sequence, adaptable to Ani's next answer:

1. **PGI concrete job:** "When you started the PGI portal, what was one real task
   a member or officer needed to do, and how were they doing it before?" His
   answer grounds requirements without inventing a tidy origin story.
2. **Structured AI ownership:** one interaction he worked on, what was difficult
   and what the people using it needed. Ask about outcome after ownership is clear.
3. **Awareness:** one real recent episode that explains the title, then compare
   his current meaning with the existing prose.
4. **Saturdays and monitor:** establish the dated experience and identify which
   measurements are his before polishing claims. Coordinate overlapping material
   without making the pieces repeat each other.
5. **Todos and search:** a real example for the former; exact stance and boundaries
   of the prediction for the latter.
6. **Smaller work pages:** one essential interaction/outcome each, followed by
   proportionate evidence. Resolve the Range/Mattracks naming before drafting.
7. **Optional draft/new topics:** decide whether an idea adds something absent
   from the existing essays or belongs as a section in a work page.

For each reviewed section, append only: source anchor/date, covered meaning,
unresolved personal question or factual claim, wording acceptance and next step.
Publication is recorded separately from wording acceptance. Do not import other
people's messages into this repository as voice evidence.

## Possible new pieces, not commissioned claims

These are topic proposals drawn only from Ani's ideas, not approved titles or
positions. Ask whether he wants a separate essay before creating a public record.

- Why a chat composer's small interactions mattered to him, using his archived
  Chat work and recordings. Could instead be the central section of that work page.
- Designing a club portal that officers can maintain themselves, using verified
  PGI tasks and design decisions. May be best as the PGI case study alone.
- What his first paid software project was actually like, only if he wants to
  discuss the Mattracks experience after clarifying the scope and people involved.
- How he chooses the evidence for a portfolio: a small interaction, a focused
  image, or a working demo. Ground this in decisions he makes during this review.

No additional topic is needed to make this map complete. The five published
articles and ten retained work pages are the current review scope.

## Local implementation checkpoint

The shared writing and work detail templates now use option 3's layered-blue
masthead with a curved lower boundary and stable per-route composition. Reading
surfaces share typography and light/dark tokens; work retains distinct project
identity, status/timeframe, actions, story media, and technical sections.
Year ranges use spaces around the dash. Writing list entries share the main
site's full-card artwork and title/date row. Article headers use compact spacing,
plain navigation, and the publication date; reading-time labels are omitted.
Topics appear as individual chips. In light mode, writing pages use the main
site's blue canvas and white header, with dark prose on a light reading surface.
The dark palette remains unchanged. Project screenshots keep their natural ratio
and can open in a keyboard-accessible fit/actual-size viewer.

NYU Purity Test uses March 2025, based on the complete local repository history's
first commit and deployment attempts on March 30. iMessage MCP uses February
2026, based on its first commits on February 24 and npm's first-publication
timestamp on February 25. These replace the older unsupported year labels.

Options pricing is hidden in canonical content and generated projections. Local
HTTP checks confirm 404 on its old route and absence from home, work, and sitemap.
No source content was deleted. All existing narrative prose remains unchanged.

Figure, native-video and click-to-load embed primitives are documented in
`editorial-media.md`. No new third-party embed has been added to an article;
provider-specific frame policy and playback must be checked with the selected
real source. This is local implementation, not a production release receipt.

The global write-with-ani calibration reference was amended at Ani's explicit
request. Private message sampling informed tentative voice observations only;
private messages are not reproduced here. The named Mattracks conversation was
not reliably located in the available local message index, so its project history
remains needs Ani rather than researched evidence.

Interview pending: before PGI, what was the most frustrating concrete task for a
member or officer, and what did Ani personally decide to change about it?
