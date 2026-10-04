# Local integration queue

`docs/integration-queue.json` is the maintained, versioned index of work in the
canonical local review lane. It contains no private draft text, credentials or
personal records. The integration owner maintains it alongside branch changes.
Other workers hand off their exact revision and verification to that owner.

Run `node scripts/dev/integration-queue.mjs list` to see pending work. States are
`implementing`, `locally-integrated`, `awaiting-review`, `approved`, and `deployed`.
Local integration means code is in the review candidate, not GitHub main. A green
check does not mean approved, merged or deployed. The queue records evidence;
it does not merge, publish content or deploy anything.

Use explicit updates, for example:

```sh
node scripts/dev/integration-queue.mjs update --id local-review-dx --revision FULL_40_CHARACTER_SHA --state awaiting-review --note 'Integrated; awaiting visual acceptance'
node scripts/dev/integration-queue.mjs update --id local-review-dx --revision FULL_40_CHARACTER_SHA --approval code --by Ani --evidence 'Exact candidate review reference' --state approved
```

The revision must be a full commit SHA. Changing it clears prior approvals and
release evidence. Code review, content publication approval and production
release approval are distinct scopes. An item has a `code` or `content` lane;
its matching approval is required to mark it approved. `--approval production`
records a separate exact-revision release approval. Never invent approval from
CI results or from another task's request. These records do not override native
permissions, live branch protection, or repository release controls.

To record a verified release, supply `--state deployed`, `--revision`, `--target`
and `--evidence` pointing to provider and live proof. Both lane and production
approvals are required by the update command. Historical release entries can be
seeded with explicitly labeled receipts without fabricating approval history.
The initial PR #488 entry records the paired www/admin deployment. Historical seeded state is
not a fresh provider audit.

Add new entries with a stable id, title, lane, state, full revision (or null while
implementing), empty approvals and an honest note. Keep independent deployment
targets in separate entries. Content entries refer to a code snapshot identifying
the reviewed publication record; keep private content in CMS, not this file.
Commit queue changes with the corresponding handoff or integration checkpoint.
Never put credentials or private record payloads in notes or evidence references.

Checks: `node --test scripts/dev/integration-queue.test.mjs`.
