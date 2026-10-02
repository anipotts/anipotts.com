# public content and Admin review

Historical brief, superseded by the direct CMS publisher on 2026-09-22.
Follow [platform architecture](platform-architecture.md#authentication-and-production-boundaries)
and [direct CMS publication](design/admin-workspace/direct-cms-publication.md)
for current authentication, content ownership and operations. The body below
preserves the earlier design and is not an active implementation contract.

## source contract

Public content has one render source: `content/public`.

- `content/public/pages/*.md` owns route copy and structured page sections.
- `content/public/projects/*.md` owns project metadata and body content.
- `content/public/writing/*.md` owns writing metadata and body content.
- `pnpm content:generate` validates those files and produces the public TypeScript
  contract, the Admin projection, and additive D1 seed input.
- `apps/www` renders the generated contract and Astro content collections. It
  does not read `page_content` at runtime.

Generated files are consumers, not editable sources. The generator rejects
manual drift.

## Admin boundary

Admin reads the generated projection and may also show D1 content-operation
metadata. Those D1 rows are draft, proof, and migration history. They do not
override public routes.

The editor may save a passkey-protected `content_draft_operations` row. A draft
can be previewed and reviewed, but publication requires a source-controlled
change to canonical content, repository checks, merge, and the scoped public
deploy. No browser form writes directly into the public render source.

The current tables remain governed history:

- `page_content`: historical published seeds and legacy review state
- `content_records`: retained field-override proposal storage
- `content_draft_operations`: private draft and preview operations
- `content_publish_events`: immutable publication proof

Historical migrations remain immutable ledger input. Do not replay them to make
D1 the public source again.

## content inventory

| surface            | canonical source                                   | Admin representation                                     |
| ------------------ | -------------------------------------------------- | -------------------------------------------------------- |
| homepage           | `content/public/pages/home.md`                     | generated page fields, proof cards, selections, mentions |
| making             | `content/public/pages/making.md` and project files | generated page copy, buckets, project inventory          |
| project archive    | `content/public/pages/projects.md`                 | generated page copy                                      |
| project detail     | `content/public/projects/*.md`                     | generated metadata and body preview                      |
| writing index      | `content/public/pages/writing.md`                  | generated page copy                                      |
| writing detail     | `content/public/writing/*.md`                      | generated metadata and body preview                      |
| newsletter         | `content/public/pages/newsletter.md`               | generated copy plus private draft operations             |
| newsletter archive | `content/public/pages/newsletter_archive.md`       | generated page copy                                      |
| systems            | `content/public/pages/systems.md`                  | generated structured page content                        |
| orchestrating      | `content/public/pages/orchestrating.md`            | generated structured page content                        |

Archived labs content under `docs/archive/labs/content` is reference material,
not an active public source.

## edit and publish flow

`canonical source -> generated projection -> private draft -> preview -> review -> source change -> checks -> merge -> deploy proof`

Draft save and public publication are separate effects. A successful draft save
may refresh metadata-only proof in `admin_proof_events`; it must not place the
proposed copy in that proof row.

Publishing requires exact authority when it merges shared code, deploys public
content, changes D1, sends outbound content, or changes a provider. The editor
must keep disabled controls absent rather than exposing hidden write routes.

## editor fields

Project fields include title, status, year, tags, summary, body, links, role,
featured state, and deterministic sort order.

Writing fields include title, date, tags, preview, body, source links, status,
and related project.

Newsletter fields include headline, deck, CTA label, response text, footer,
sender metadata, and archive copy. Newsletter delivery remains a separately
authorized outbound action.

## next improvements

- make approved Admin drafts produce a reviewable source patch instead of a D1
  public override
- keep canonical content validation and generation deterministic
- preserve article claims and source links during editing
- keep newsletter planning separate from send authority
- reconcile or retire historical `page_content` rows after the D1 ledger is
  bootstrapped and rollback proof exists
