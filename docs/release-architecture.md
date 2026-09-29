# trustworthy releases

The repository has one release classifier and four GitHub workflows. CI proves
the current pull request head. Merging remains an explicit native Codex action
bound to that same head.

## required checks

- `Build, lint, typecheck, test`
- `Security Review`

`main` must be current before merge and unresolved review conversations must be
closed. GitHub enforces both checks for administrators too. The release
classifier still identifies protected and unknown changes, but it does not ask
for a duplicate comment, label, review, or receipt.

After the required checks pass, an agent uses one exact-head native merge
command. Deployable files use a PR. Manual deployment is limited to Ani, the
exact supplied main SHA, and the main branch.

## release classes

Automatic changes include ordinary app code inside existing routes, static
content, presentation, and future migrations whose SQL and manifest prove an
additive operation.

Protected changes include auth, Worker configuration, workflow permissions,
new or removed routes, cron, queues, Durable Objects, outbound workers, secrets
contracts, destructive SQL, data rewrites, and the release policy or migration
manifest themselves. An unclassified path fails closed.

The classifier emits affected targets, D1 impact, migration consumers, release
ID, and exact source SHA. GitHub owns branch checks, migration tooling owns D1
safety, and native approval owns consequential effects.

## D1 boundary

`apps/admin` is the only migration owner. Its D1 binding points at the governed
repository migration directory. The production Wrangler ledger was bootstrapped
and verified on August 24, 2026 without replaying historical files.

The manifest records immutable hashes for the 41 applied files and the current
read-only production schema fingerprint. The verified baseline contains 64
tables, 87 indexes, and 6 triggers. The fingerprint uses normalized
`sqlite_master` metadata because the database contains FTS5 virtual tables.

The approved bootstrap completed with this proof:

1. verify the live schema fingerprint and every historical postcondition
2. repair any mismatch without replaying history
3. capture a Time Travel bookmark
4. create Wrangler's ledger with the pinned Wrangler schema
5. record historical files only after their postconditions pass
6. verify the Admin binding still owns the exact migration directory
7. store the receipt before enabling additive migration promotion

Every future migration needs a checksum, risk, consumers, preconditions,
postconditions, and rollback strategy. Recorded migration edits fail CI. The
local proof applies an additive migration twice and requires the second run to
be a no-op.

## production sequence

Production releases queue in one concurrency group. They verify the exact
`main` SHA, compare the desired source with each known deployed source, classify
targets, apply eligible migrations when present, deploy affected consumers,
and run the shared smoke implementation. Health responses report the expected
commit and schema version. Deployment does not repeat the full PR suite.

Application rollback is limited to releases without a migration. A failed
migration release stops and keeps D1 unchanged after the failed file rollback.
The workflow never invokes Time Travel restore automatically.

Admin deployment is also held until the Production environment contains a
least-privileged Access identity and app-native read-only capability. The smoke
identity must read protected routes and must receive a rejection from write
routes. Secret values stay outside the repository and logs.

## current rollout state

Ordinary application promotion and application-only rollback are enabled.
Deployments still revalidate the exact `main` SHA, use serialized production
jobs, deploy only classified targets, and smoke the resulting release.

Database and authenticated Admin gates remain independent:

- provably safe additive migrations may promote through the governed manifest
  and Wrangler ledger; destructive, auth, rewrite, and unknown migrations stay
  exact-gated
- authenticated Admin smoke stays held until its least-privileged production
  identity is installed and proven unable to write
- Cloudflare Access and the exact-owner assertion remain the human boundary;
  Google/instant-authentication rollout follows the independent provider gates in
  [platform architecture](platform-architecture.md#authentication-and-production-boundaries)

No separate application canary ceremony is required. A normal scoped release
with exact-SHA validation and smoke proof is the release proof.

The legacy Solid source and deployment target are retired. Rollback uses the
previous verified Astro deployment. Retirement does not remove production
resources or change the independent Access and authenticated-smoke gates.
