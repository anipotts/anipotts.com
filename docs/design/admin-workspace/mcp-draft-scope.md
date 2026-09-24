# `mcp:draft` scope proposal

Proposed September 24, 2026. Not approved. This is a design spec for review, not
an implementation ledger. It asks for one decision from Ani: whether an agent
session may create and revise `/writing` drafts through a scoped machine token
instead of a browser session with a fresh passkey step-up.

Nothing here ships until Ani approves the contract change in "Authority required"
below. The change touches the authentication boundary, which `CLAUDE.md` reserves
for Ani's exact approval.

## Problem

An agent session cannot put a draft into Admin. It can only open a PR against
`content/public/writing/*.md` and wait.

That is correct for finished work and wrong for the case it keeps hitting: a long
article that needs many small revisions before it is worth a human's attention.
Each revision currently costs a branch, a push, a PR round trip, and a red draft
gate, and the draft lives on a branch instead of in the workspace where Ani reads.

## Current state, as built

Three paths exist. None of them is machine-writable, and that is deliberate.

| Path                                                | Auth                                             | Writable by a machine |
| --------------------------------------------------- | ------------------------------------------------ | --------------------- |
| `POST /api/admin/content/draft-operation`           | `requireAdminMutation(context, "draft:save")`    | No                    |
| `POST /api/editorial/create?kind=writing&id=<slug>` | editorial CSRF cookie plus header, behind Access | No                    |
| `GET`/`POST /api/mcp`                               | `requireMcpReadToken`, scope `mcp:read`          | No, read-only         |

`requireAdminMutation` in `apps/admin/src/lib/admin-auth.ts` demands exact origin,
an Access owner principal, no session restriction, the named capability, and a
passkey step-up inside a 600 second window. A machine holds none of that.

The MCP endpoint already has everything except the write half:

- `admin_machine_tokens` carries a `scopes` TEXT column, already parsed through
  `parseScopes` and already checked against a scope constant.
- Tokens are `apmcp_` plus 32 random characters, stored hashed, 90 day expiry,
  with `last_used_at` and `last_used_ip_hash` updated on every authenticated call.
- Minting, rotation and revocation exist in `apps/admin/src/lib/admin-machine-tokens.ts`,
  each already writing an `admin.machine_token.*` audit row.
- `adminMcpManifest` already publishes a `write_tools` field.

The editorial draft path is also already built and tested. `homeEditorApi` handles
`action === "create"` against the `EDITORIAL` Durable Object, `newWritingSource`
produces valid `status: draft` frontmatter, and
`apps/admin/test/editorial/writing-create.test.ts` proves it creates exactly one
private revision on repeated requests and never overwrites a colliding draft.

So this proposal adds a scope and two tools. It does not add a storage path, a
draft format, or a publication route.

## The blocking contract

`AdminControlAuthContract` in `packages/lib/src/admin-control/types.ts` types the
field as a literal:

```ts
write_tools: "disabled-until-broker-and-signed-connect-diff";
```

`queries.ts` sets it, `adminMcpManifest` publishes it, and
`packages/lib/src/admin-control/index.test.ts:106` asserts it. The repository
already decided that MCP write tools stay off until a broker and a signed connect
diff exist.

This spec does not claim to satisfy that condition. It proposes a narrower one:
draft-only writes, to a private revision store, with no publication reachable from
the token. If Ani prefers to hold the original condition, the answer is no and the
PR-per-draft flow stays. That is a legitimate outcome and the rest of this document
should be read as the cost of saying yes.

## Proposal

### Scope

One new scope, `mcp:draft`. It is additive and never implied by `mcp:read`.

- A token may hold `mcp:read`, or `mcp:read` plus `mcp:draft`. A draft-only token
  is not offered, because every write tool needs to read the current revision first.
- Expiry is 30 days, not the 90 of a read token. A write credential should expire
  inside a normal working month.
- Rotation may not change a token's scopes. Widening happens by minting a new
  token, so the audit row that granted write access is always a `created` row.
- `mcp:draft` is a distinct checkbox at mint time, defaulting off.

### Tools

Three, all confined to `kind: "writing"`.

| Tool                         | Does                                        | Refuses                                  |
| ---------------------------- | ------------------------------------------- | ---------------------------------------- |
| `admin.get_writing_draft`    | read one draft and its revision number      | any record whose `kind` is not `writing` |
| `admin.create_writing_draft` | create a private revision from a title      | an id that already exists                |
| `admin.update_writing_draft` | save a new revision at an expected revision | a stale `expectedRevision`               |

Each delegates to the existing `homeEditorApi` actions `create` and `save` against
the `EDITORIAL` Durable Object. No new write path is introduced. The id is checked
with `validWritingId` and the body is parsed through `writingSchema` before it is
stored, so a malformed draft is refused at the boundary rather than at build time.

### Non-goals, enforced rather than documented

A `mcp:draft` token must not be able to reach any of these, and the tests below
prove it rather than asserting it:

- `publish`, `unpublish`, `retry-publication`, `cancel-publication`,
  `cancel-legacy-publication`, `discard`, `restore`
- any record whose `kind` is not `writing`, including `page`, `project` and
  `newsletter`
- the newsletter send path, ingest, the approval bridge, or any worker
- direct D1 statements against content tables
- `admin_machine_tokens` itself, so a token can never widen its own scope
- Cloudflare Access configuration, or anything under `identity:manage`

The dispatch is an allowlist of three tool names, not a denylist of forbidden ones.

### Audit

Every `mcp:draft` write records an `admin.machine_token.draft_write` row carrying
the token id, the token name, the record id, the resulting revision, and the
action. Ani should be able to read Admin's audit view and see every draft an agent
touched, without correlating anything.

A write never records the draft body.

## What stays true after this ships

- `/writing` is unchanged. `isPublishedWriting` gates on `status === "published"`,
  so a draft created by a token is invisible on the public site, absent from
  search records, and generates no social card. The forced www build already
  demonstrates this for PR #445.
- Publication still requires Ani in a browser with a fresh passkey step-up. The
  token moves drafts, never posts.
- Cloudflare Access is unchanged. This adds a scope inside the existing machine
  token system; it does not add an authentication mode, remove Access, or touch
  the native session fallback.
- Git remains the source of initial records. A draft created through MCP is a
  private revision, exactly as one created in the browser is.

## Acceptance tests

The PR is not reviewable without all six.

1. A token holding only `mcp:read` calls `admin.create_writing_draft` and receives
   a scope error. The draft store is unchanged.
2. A token holding `mcp:draft` calls a publication action by name and receives an
   unknown-tool error, because the action is not in the allowlist.
3. A token holding `mcp:draft` calls `admin.create_writing_draft` with
   `kind: "page"` smuggled into the params and is refused.
4. Two identical `admin.create_writing_draft` calls produce one revision and never
   overwrite a colliding draft, matching the existing browser-path test.
5. `admin.update_writing_draft` with a stale `expectedRevision` is refused and the
   stored revision is unchanged.
6. A draft created through MCP does not appear in the www build's public routes,
   search records, or social cards.

Plus the existing suite: `pnpm check:changed`, and `pnpm validate` because this is
a shared change.

## Rollback

Revoke the token. Every write path added here is reachable only by a token holding
`mcp:draft`, so revocation is a complete rollback with no deploy.

To roll back the code, revert the scope constant and the three tool names. The
manifest literal returns to its current value and the endpoint is read-only again.
No migration runs in either direction, because `scopes` is an existing column.

## Authority required

Ani's exact approval is needed for one thing, and it should be given or refused
explicitly rather than inferred from merging this PR:

> Change `AdminControlAuthContract.write_tools` from
> `"disabled-until-broker-and-signed-connect-diff"` to a value that permits
> draft-only writes under a scoped machine token, and accept that an agent session
> holding such a token can create and revise `/writing` drafts in production Admin
> without a passkey step-up.

Everything else in this spec sits inside the existing admin lane.

## Open questions

- Should a `mcp:draft` token be restricted to records it created, or may it revise
  any writing draft? Restricting is safer and makes collaboration awkward.
- Should the draft store mark machine-created revisions in the UI, so Ani can see
  at a glance which drafts an agent touched without opening the audit view?
- Is 30 days the right expiry, or should a write token be minted per working
  session and revoked at the end of it?
