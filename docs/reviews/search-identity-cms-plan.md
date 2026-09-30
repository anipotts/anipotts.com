# Search identity review and pending CMS greeting update

Status: proposed; awaiting Ani's final approval. No production CMS mutation,
merge, deployment, release, or auto-merge is authorized by this plan.

## Proposed CMS change

Record: homepage (`home`), field `sections.intro.heading`.

| Value                                                        | Copy                 |
| ------------------------------------------------------------ | -------------------- |
| Current public greeting, observed during the identity review | `hi, i'm ani!`       |
| Desired greeting                                             | `hi, i'm ani potts!` |

The current value above is the observed public value, not a fresh authenticated
CMS read. Before applying an approved update, read the latest homepage record
and compare this field. If it differs, preserve that newer edit and return the
conflict for review. Change only the heading; preserve the detailed bio,
mentions, section ordering, publication state and unrelated fields.

Git homepage content is a seed/default. A published CMS homepage record overrides
it, so deploying this PR alone does not replace the published CMS greeting.
The code-owned search title, description, reporting links and writing byline
can take effect through a future approved code deployment.

After Ani approves the exact change and publication separately, use the existing
editorial CMS workflow, review its revision, then verify the public heading,
canonical, search metadata and unchanged bio. Preserve the preceding revision
for recovery. Do not seed or overwrite the production database from this PR.

## Code copy under review

- Homepage title: `ani potts` becomes
  `Ani Potts | Software Engineer Building AI Systems`.
- Description: the full intro paragraph without Ani's full name becomes
  `Ani Potts builds AI agents and data intensive software systems, and writes about working with coding agents.`
- Original intro/description:
  `i build data intensive systems with AI and sometimes share what i'm learning online. i've worked on construction document agents at structured ai (YC F25) and artist discovery tools at our bad habit, an atlantic records venture. business insider also wrote about how i use coding agents in my everyday work under usage constraints.`
  This remains the visible intro paragraph unchanged.
- New homepage links: `business insider: original reporting` and
  `my essay on coding agent limits`.
- New writing byline: `by ani potts`, linked to the homepage with `rel="author"`.

The original reporting is Tim Paradis's April 13, 2026 Business Insider article,
[Saturdays are for Claude: How AI limits are reshaping the workday](https://www.businessinsider.com/ai-usage-limits-causing-some-to-restructure-their-workday-2026-4).
It names Ani and discusses his coding work around AI usage limits. Historical
student/startup descriptions in that reporting are not added as current claims.

Existing Person/ProfilePage/WebSite identities, aliases and six social profiles
are preserved. No new job status, credentials, awards, legal-name aliases or
project results are asserted. Our Bad Habit remains described as an Atlantic
Records venture. Threadline/Rebase remains an unbuilt prototype idea and has no
new public page or announcement in this change.

## Evidence

Local Node 24.19.0 scoped validation passed: www/admin builds, lint, type checks
and tests, public copy policy and formatting. All 137 www tests passed. Rendered
Worker fixtures verified identity JSON-LD, canonicals, sitemap/indexability,
CMS overrides, the reporting/essay links and writing author attribution.
Browser review covered the desktop homepage and writing page and a 390px
homepage with no horizontal overflow. These fixtures used a synthetic local
content store, not production CMS. No screenshots containing secrets or admin
data are included.

Draft PR CI performs reduced draft validation by repository policy; a draft
check success is not full release validation or production approval. Full CI
must run on the reviewed head before any separately approved integration.
