# Coding agents and the production editor

Coding agents can use the existing owner editorial API or operate the editor
through a browser MCP session. Production Admin remains the normal authoring
environment. Draft saves are private. Publication changes the live website and
requires discussion of the exact content with Ani before the publication command.
Deploying this tool does not authorize changing any published wording.

The native CLI lives at `scripts/editorial/editorial.mjs` and runs with Node 24.
It uses no paid model, new service identity, credential store or alternate API.
It never calls GitHub to publish content. Software still follows the repository's
protected PR and deployment workflow.

## Owner session

Cloudflare Access with the exact-owner assertion remains the only identity.
An agent's machine or GitHub identity cannot replace it. In a browser, Ani signs
in normally at `https://admin.anipotts.com`; the browser then carries the session.

For the CLI, use the existing human Access token cached by `cloudflared`, with
shell tracing disabled. After Ani's normal owner login, capture the cached token
without printing it:

```bash
set +x
task_editorial_token=$(cloudflared access token --app https://admin.anipotts.com)
export ANIPOTTS_EDITORIAL_ACCESS_TOKEN="$task_editorial_token"
unset task_editorial_token
```

This token goes in `Cf-Access-Token`, the header used by cloudflared's native
Access transport. It remains a human app session, not a service identity. If the
cached session is absent or expired, complete deliberate owner login before
trying again. The script never invokes cloudflared or starts a login on its own.

As a fallback, provision `ANIPOTTS_EDITORIAL_OWNER_COOKIE` containing exactly
`CF_Authorization=<the existing human owner session cookie>` through the user's
existing secure environment mechanism. Set only one of the two session variables;
the CLI rejects both together. Do not paste either value
into chat, a command argument, shell history, a source file, an exported review,
or logs. Do not read browser credential databases to obtain it. A cookie supplied
by another person still fails the server's exact-owner check.

The CLI's only destination is `https://admin.anipotts.com`. It sends
`X-Requested-With: XMLHttpRequest`, refuses redirects, login HTML, non-JSON and
oversized responses, and times out after 30 seconds. A write first reads
`/api/editorial/csrf`, then pairs that endpoint's cookie with `X-Editorial-CSRF`
and the fixed `Origin`. CSRF grants no identity. Failed session checks require
deliberate owner reentry; the CLI neither logs in nor follows a login redirect.

## Private draft workflow

Discuss the desired edit, then read the target record. `page` IDs are `home`,
`work`, `writing`, `systems` and `newsletter`; existing work and writing use their
stable record IDs. An ID is not a URL that the tool follows.

```bash
node scripts/editorial/editorial.mjs read --kind writing --id example-article
node scripts/editorial/editorial.mjs export --kind writing --id example-article --out /tmp/example-draft.md
```

`read` prints revision, public pointer, inventory and publication metadata only.
`export` writes the current private draft, or the public baseline when no private
draft exists. It preserves source bytes represented as valid UTF-8, including BOM,
CRLF and Unicode. Exported source, history and review files are private plaintext;
keep them in a task-owned protected location, never stage or upload them as test
fixtures. Files use mode 0600, refuse overwriting, and should be handled under
the user's existing private-file retention policy.

Edit the exported file, retaining unrelated source and metadata. Supply the exact
revision reported by `read` or `export` and a UUID you record before the request:

```bash
node scripts/editorial/editorial.mjs save --kind writing --id example-article --source /tmp/example-draft.md --revision 7 --request-id YOUR_RETRY_UUID
node scripts/editorial/editorial.mjs create --kind writing --id new-article --title 'Agreed draft title' --request-id YOUR_CREATE_UUID
node scripts/editorial/editorial.mjs history --kind writing --id example-article --out /tmp/example-history.json
```

Replace the example IDs, revision and UUID placeholders with the real agreed
record and a valid UUID. `create` also supports `work`; it creates a private draft,
never a live article or project. A save acknowledgment returns the saved revision
and source validity. Invalid intermediate content may be privately saved; it is
not publishable. A revision conflict stops without retrying or overwriting the
other version. Reopen the editor or export the current draft, compare both copies,
and discuss the resolution rather than silently rebasing.

After an interrupted save/create, retain the original source, revision and UUID.
An identical retry recovers the original server outcome. Never change the payload
under that UUID or generate a replacement UUID to bypass an unresolved result.
History exports one revision per page to bound large source responses; use its `nextBeforeRevision` with `--before` and a new
output filename for older pages. It does not automatically restore or delete.

Open the same record in production Admin to inspect the saved fields, actual-page
preview, media and review diff. Browser preview remains the way to inspect
rendered output; the CLI does not claim visual acceptance.

## Media processing preparation

The existing uploader retains its current limits. An additive server normalization
and crop API is being qualified separately; see the
[media processing contract](editorial-media-processing.md) for owner/CSRF rules,
immutable identities and measured limits. It remains held source preparation.
Neither an API response nor a software deployment authorizes publishing an image
or changing a draft. The CLI commands above cover record authoring; binary media
CLI commands and default browser integration are not claimed.

## Discuss and review before publication

Preparing a review is read-only:

```bash
node scripts/editorial/editorial.mjs review --kind writing --id example-article --out /tmp/example-review.json
```

The file contains the exact acknowledged draft and public baseline, their
SHA-256 hashes, expected revision, public publication ID and a new immutable
operation ID. The command prints a confirmation digest for the entire review.
Compare the two sources and show Ani the proposed text and metadata changes
through the editor's diff or a suitable private discussion surface. Keep raw
source, destinations, dates, visibility and media changes in review even when
the visible wording is unchanged. Record Ani's authorization and the digest in
the task before publishing. Preparing or saving a review is not approval.

New writing still needs reviewed `status: published` and publication-date metadata
in its privately saved source; new work needs supported public visibility. Use
the existing editor's Properties/Publish preparation or explicitly review these
source edits. The CLI never changes visibility or dates automatically.

Only after Ani approves that exact review:

```bash
node scripts/editorial/editorial.mjs publish --review /tmp/example-review.json --confirm APPROVED_REVIEW_SHA256 --approval-ref 'Reference to Ani approval of this exact review'
```

The optional `--approval-ref` appears in the command's result so the task can
retain the human discussion reference. The API does not persist that reference;
it is not a server credential or independent proof of approval. The agent must
never invent it.
The reviewed-file digest is required even when this optional reference is omitted.
The client validates
the file's hashes and digest, rereads the server snapshot, and refuses a changed
draft revision, source, baseline or public pointer before posting. The server
enforces the same revision/hash/publication checks at activation, including races
after this reread. A changed review requires a new review and refreshed approval.
There is no automatic publication, unpublish, discard, rebase, scheduling, batch,
media-upload or URL-change command in this tool.

The accepted response is durable publication progress, not proof the piece is
live. Inspect the original operation:

```bash
node scripts/editorial/editorial.mjs status --kind writing --id example-article --operation-id ORIGINAL_OPERATION_UUID
```

After an interrupted publish, inspect this operation before deciding any retry.
Reuse the same unchanged review and operation identity only when reconciliation
shows retry is appropriate. Do not create a replacement operation to hide an
unknown outcome. Report saved, accepted, activated and verified separately.
Check the publication's terminal state and actual public detail/discovery routes;
blocked, superseded or incomplete verification requires its own explanation.

## Browser MCP and direct API use

Reuse a task-owned browser session at the canonical production Admin, with Ani's
existing authorized owner login. Read the same Content record, save privately,
inspect History/Preview/Review changes, and stop at the publication review until
the exact content is approved. Keep Ani's visible tab and viewport under his
control. Do not export the browser cookie to make automation work.

If browser MCP supports same-origin requests, use `fetch` inside that authenticated
Admin page with `credentials: "same-origin"`, `redirect: "error"`,
`cache: "no-store"` and `X-Requested-With: XMLHttpRequest`. Require JSON before
reading a body. For writes, read CSRF first; the browser retains its HttpOnly
cookie and the request sends its returned token as `X-Editorial-CSRF`. Same-origin
browser fetch supplies the required Origin; do not spoof an owner assertion or
send credentials to a cross-origin endpoint. Session reentry remains a human step.

| Endpoint under `/api/editorial/`        | Method | Relevant contract                                                                                                |
| --------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| `record?kind=…&id=…`                    | GET    | `base`, `draft`, publication and publishing capability                                                           |
| `csrf`                                  | GET    | Token plus matching HttpOnly cookie                                                                              |
| `history?kind=…&id=…&beforeRevision=…`  | GET    | History page and next cursor; omit cursor for newest                                                             |
| `save?kind=…&id=…`                      | POST   | `source`, `expectedRevision`, immutable `requestId`                                                              |
| `create?kind=…&id=…`                    | POST   | `title`, `expectedRevision: 0`, immutable `requestId`                                                            |
| `publish?kind=…&id=…`                   | POST   | `expectedRevision`, `operationId`, `discloseSource: true`, reviewed draft hash, baseline hash and public pointer |
| `publication?kind=…&id=…&operationId=…` | GET    | Original durable operation status                                                                                |

The publication field names are `reviewedSourceSha256`,
`expectedBaselineSha256` and `expectedPublicationId`. Use the server snapshot;
never guess these values or substitute the current public state after approval.
The client deliberately exposes a narrow workflow instead of a generic arbitrary
authenticated request tool. Browser/API operation has the same discussion,
review, session, concurrency and source-preservation obligations as the CLI.

## Verification

```bash
node --test scripts/editorial/client.test.mjs
node scripts/editorial/editorial.mjs --help
```

Tests use injected transport and synthetic records, without network calls or
source/database writes. The file-export test creates and removes only its own
temporary synthetic files. They prove request boundaries and publication review
checks, not live owner authentication or a production publication.
