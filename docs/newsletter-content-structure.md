# newsletter content structure

purpose: give ani and agents one draft shape for `news.anipotts.com` issues
before any admin write path, production content store, outbound send, or
publishing flow exists.

this is content structure only. it does not authorize sending, scheduling,
publishing, dns, auth, env, secrets, cloudflare access, workers, endpoints,
admin writes, or production d1 changes.

## existing source inventory

| surface              | current source                                                                  | role                                                                      | lane status                       |
| -------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------- |
| newsletter landing   | `apps/www/src/pages/newsletter.astro`                                           | renders the `news.anipotts.com` landing page from normalized page content | read-only source reference        |
| archive shell        | `apps/www/src/pages/newsletter/archive.astro`                                   | placeholder archive until the first-party send path is verified           | read-only public shell            |
| issue table          | `drizzle/migrations/0005_newsletter_system.sql:newsletter_issues`               | future storage shape for issue rows                                       | schema reference only             |
| system brief         | `docs/newsletter-system.md`                                                     | infrastructure, resend, compliance, and rollout gates                     | authoritative for live-path gates |
| content inventory    | `docs/content-admin-editor-brief.md`                                            | public-site editable-content inventory and newsletter backfill candidates | admin planning source             |
| shared content       | `packages/content/src/admin/*`                                                  | static inventory, preview rows, and newsletter issue draft data           | preview model only                |
| read-only admin      | `apps/admin/src/data/content.ts`                                                | compatibility re-export for current admin routes                          | preview model only                |
| newsletter admin     | `apps/admin/src/data/newsletter.ts` and `apps/admin/src/pages/newsletter.astro` | static issue draft review inside canonical Astro admin                    | preview model only                |
| issue detail preview | `apps/admin/src/pages/newsletter/[slug].astro`                                  | Astro-native protected issue preview with proof, sources, and gates       | preview model only                |
| newsletter worker    | `workers/newsletter/*`                                                          | async send worker and queue consumer                                      | out of scope for this lane        |

## draft issue record

these fields are enough for ani to draft into and enough for admin to preview
later without writing production content.

| field             | type   | required | source mapping                                 | note                                                                   |
| ----------------- | ------ | -------: | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `id`              | string |      yes | local fixture or future `newsletter_issues.id` | stable draft id, not a provider id                                     |
| `slug`            | string |      yes | future `newsletter_issues.slug`                | url-safe archive slug                                                  |
| `status`          | enum   |      yes | future `newsletter_issues.status`              | `idea`, `draft`, `preview`, `ready_for_review`, `blocked`, `published` |
| `title`           | string |      yes | future `newsletter_issues.title`               | public archive title                                                   |
| `subject`         | string |      yes | future `newsletter_issues.subject`             | inbox subject, can differ from title                                   |
| `summary`         | string |      yes | future `newsletter_issues.summary`             | one-line archive and admin preview                                     |
| `dek`             | string |       no | future `metadata.dek`                          | short setup under the title                                            |
| `audience`        | string |      yes | future `metadata.audience`                     | who this note is for                                                   |
| `source_refs`     | array  |      yes | future `metadata.source_refs`                  | file paths, commits, posts, screenshots, or docs                       |
| `claims`          | array  |      yes | future `metadata.claims`                       | factual claims that need proof before publish                          |
| `sections`        | array  |      yes | render source for `html` and `text`            | ordered content blocks                                                 |
| `links`           | array  |       no | future `metadata.links`                        | public links only, no private docs                                     |
| `assets`          | array  |       no | future `metadata.assets`                       | screenshots or images, with approval status                            |
| `preview_notes`   | string |       no | future `metadata.preview_notes`                | editor context for admin preview                                       |
| `blocked_actions` | array  |      yes | future `metadata.blocked_actions`              | send, publish, schedule, import, or store actions still gated          |
| `approval_refs`   | array  |       no | future `metadata.approval_refs`                | authority ids only after ani grants them                               |

## issue sections

use these block kinds so draft issues can render to html, plain text, and an
admin preview without custom code per issue.

| block kind  | fields                            | use                                              |
| ----------- | --------------------------------- | ------------------------------------------------ |
| `opening`   | `body`, `source_refs`             | sets context in ani's voice without a fake hook  |
| `worklog`   | `heading`, `items`, `source_refs` | explains what changed or what was built          |
| `receipt`   | `label`, `body`, `source_refs`    | shows proof behind a claim                       |
| `note`      | `heading`, `body`, `links`        | regular prose section                            |
| `link_list` | `heading`, `links`                | compact pointers to posts, repos, docs, or demos |
| `close`     | `body`, `cta`                     | optional signoff or pointer back to the site     |

avoid making source material sound more finished than it is. if a claim is not
proved by a public source ref, keep it in `claims` with `status: needs_proof`
instead of putting it in polished copy.

## first draft fixture shape

agents can create local-only fixtures in a later branch using this json shape.
do not load it into d1 or an admin write endpoint without separate authority.

```json
{
  "id": "newsletter-draft-agent-handoffs",
  "slug": "agent-handoffs",
  "status": "idea",
  "title": "how i hand off work between codex and claude code",
  "subject": "how i hand off work between codex and claude code",
  "summary": "a note on filesystem handoffs, git commits, and repo rules as shared memory.",
  "dek": "",
  "audience": "builders using multiple coding agents on the same repo",
  "source_refs": [
    "AGENTS.md",
    "docs/content-admin-editor-brief.md",
    "docs/newsletter-system.md",
    "packages/content/src/admin/content.ts"
  ],
  "claims": [
    {
      "claim": "agent decisions should live in commits, handoff docs, or repo guides",
      "status": "source_backed",
      "source_refs": ["AGENTS.md"]
    }
  ],
  "sections": [
    {
      "kind": "opening",
      "body": "",
      "source_refs": ["AGENTS.md"]
    },
    {
      "kind": "receipt",
      "label": "repo rule",
      "body": "",
      "source_refs": ["AGENTS.md"]
    }
  ],
  "links": [],
  "assets": [],
  "preview_notes": "draft structure only. not approved for publishing or sending.",
  "blocked_actions": [
    "write production d1 issue",
    "publish archive page",
    "send test email",
    "broadcast to subscribers"
  ],
  "approval_refs": []
}
```

## read-only admin preview needs

the current `apps/admin` Astro admin route can stay static and read-only. future
safe slices can add newsletter preview rows with:

| admin need            | source                                       | gated action                                       |
| --------------------- | -------------------------------------------- | -------------------------------------------------- |
| issue list            | docs or static fixture files                 | no production d1 reads required for first slice    |
| issue detail preview  | draft issue record plus markdown renderer    | no save button, no queue button, no provider calls |
| source refs panel     | `source_refs`, `claims`, and `assets` fields | no private docs or secret values                   |
| blocked actions panel | `blocked_actions` and `approval_refs` fields | no live controls                                   |
| archive preview route | static render from fixture                   | no public route publish unless approved            |

current consolidated preview route:

- `/newsletter`: protected admin issue queue.
- `/newsletter/first-thing-agents-need-control-plane`: protected admin detail
  preview rendered from `packages/content/src/admin/newsletter.ts`.

older newsletter worktree branches are inputs only. do not merge them wholesale
because they predate the Astro admin cutover and can reintroduce stale
admin-solid references or old workflow state.

## gated work

these remain outside this lane:

| gate                      | why                                                              |
| ------------------------- | ---------------------------------------------------------------- |
| production d1 writes      | creates or mutates real newsletter issue state                   |
| admin save APIs           | creates a write path into public content or newsletter records   |
| test sends and broadcasts | outbound action with compliance and reputation risk              |
| resend setup              | requires secrets, verified domain state, webhooks, and dns proof |
| worker or queue changes   | touches live-path infrastructure and endpoints                   |
| archive publishing        | changes public content state for `news.anipotts.com`             |
| buttondown migration      | needs source export review and explicit import decision          |
| mailing address config    | protected compliance value, never hardcoded in repo source       |

## next safe action

the first static draft fixture is
`docs/newsletter-drafts/first-thing-agents-need-control-plane.json`. keep it as
local draft content until chief/site or ani approves the next safe slice. this
doc remains the contract: agents can draft against it, admin can preview against
it, and all live actions stay gated.

## current thread split

`chief/pro/site` owns active local browser work for passkey proof, admin preview,
and editor polish. do not duplicate that live preview loop from mini.

`chief/site` on mini owns committed source truth, deploy proof, and the read-only
newsletter pipeline. after `chief/pro/site` closes out local browser findings,
absorb only the committed or explicitly handed-off source changes.
