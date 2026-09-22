# Temporary content release test preflight

This is a local configuration gate for a reviewed synthetic Cloudflare release
test bundle. It reads files and emits a receipt. It does not create resources,
deploy Workers, execute source or SQL, contact providers, or clean up resources.
It does not authorize those actions.

The implementation is `scripts/ci/content-release-isolation.mjs`. Its Node tests
run through the existing `test:release-policy` command and CI policy checkpoint.
Changes to this gate classify as CI policy changes with no application deployment
targets.

## Run the local check

Use Node 24.19.0 and a frozen bundle assembled from the reviewed build. Obtain the
manifest SHA-256 from the review record before invoking the check; recomputing a
different digest to make a failure disappear is not review approval.

```sh
node scripts/ci/content-release-isolation.mjs \
  --bundle-root /absolute/path/to/reviewed-bundle \
  --manifest manifest.json \
  --manifest-sha256 REVIEWED_SHA256
```

Success writes one JSON receipt to stdout. Failure writes one fixed error code
to stderr and exits nonzero. Errors never echo file contents, arbitrary paths,
credentials, provider responses, or unknown input values. All referenced paths
must stay inside the supplied bundle root. Symlink entries are rejected,
including symlinked parent directories beneath that root.

## Version 1 manifest

The manifest and Wrangler configurations are ordinary standalone JSON. Unknown
or omitted required fields fail. No JSONC, TOML inheritance, environment blocks,
CLI overrides, automatic config discovery, or generated config redirection is
part of this contract.

| Manifest field           | Required value                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`          | `1`                                                                                                                        |
| `environment`            | `temporary-cloud-release-test`                                                                                             |
| `dataClass`              | `synthetic`                                                                                                                |
| `runId`                  | `qp-<pr>-<8 lowercase letters or digits>`                                                                                  |
| `owner`                  | Named `codex/` branch owner                                                                                                |
| `pr`                     | Positive integer, matching the run ID                                                                                      |
| `sourceSha`              | Asserted 40-character lowercase commit hash                                                                                |
| `publicationProfile`     | Optional; defaults to `disabled`. `direct` is recognized but explicitly rejected until isolated verification is supported. |
| `createdAt`, `expiresAt` | Exact UTC ISO timestamps with milliseconds; active window at most 24 hours                                                 |
| `accountId`              | Explicit 32-character account ID, identical in both configs                                                                |
| `resources`              | Exactly `databaseName`, `databaseId`, `mediaBucket`                                                                        |
| `files`                  | Exactly `adminConfig`, `wwwConfig`, `artifacts`, `migrations`, `fixture`                                                   |

Database and bucket names must be `<runId>-content` and `<runId>-media`. The
database UUID must be valid and non-placeholder. Worker names derive from the
run: `<runId>-admin` and `<runId>-www`. Using the existing account is allowed;
sharing its production mutation targets is not.

Every file reference has exactly `{ "path": "relative/path", "sha256": "..." }`.
`artifacts` lists every Worker module and static asset in the declared upload
directories, including chunks. `migrations` is an ordered array of 1–16 reviewed
SQL files named `0001_name.sql`, `0002_name.sql`, and so on, with strictly
increasing ordinals. Their directory must contain exactly those files. The
sequence participates in the manifest hash; it cannot be reordered silently.

The fixture JSON contains exactly `schemaVersion: 1`, the same `runId`,
`dataClass: "synthetic"`, and `records`. Each of its 1–20 records contains `id`
and `source`; IDs are unique and begin `<runId>-fixture-`. This checks fixture
identity and reviewed bytes. It cannot establish that arbitrary source text is
non-private merely from its label. Synthetic-content review remains required.

## Standalone Wrangler profile

Both configs require:

- Their run-derived `name`, the manifest `account_id`, and explicit `main`.
- `base_dir` identifying the complete prebuilt module directory, `no_bundle:
true`, and `find_additional_modules: true`. `main` must be inside `base_dir`.
- `compatibility_date: "2026-05-01"` and only `nodejs_compat`, matching the
  presently reviewed application configs. Changing compatibility is an explicit
  contract update, not an inherited default.
- An explicit boolean `workers_dev`, `preview_urls: false`, and `routes: []`.
- `RELEASE_TEST_RUN_ID` matching the manifest and
  `RELEASE_TEST_DATA_CLASS: "synthetic"`.
- One `CONTENT_DB` binding, with the manifest database name/UUID and an explicit
  `migrations_dir` matching the complete reviewed publication migration directory.
  CMS readers and the direct publisher use this dedicated binding. The legacy
  shared application `DB` is a separate store and is prohibited in this profile.
  Isolation comes from the run-owned resource identity and protected-resource
  checks, not the binding name alone.
- One `CONTENT_MEDIA` binding, with the manifest bucket name. The direct
  publisher uses it to stage publication assets; the public reader uses it to
  serve assets referenced by active visible publications.

Admin vars additionally require exactly `EDITORIAL_ENABLED: "true"` and
`EDITORIAL_PUBLISH_ENABLED: "false"`, the publishing kill switch. This permits
the CMS storage path while preventing new publication activation. Any other
admin var, including the retired `EDITORIAL_PUBLISH_MODE`, is rejected.
Public vars additionally require exactly `CONTENT_RUNTIME: "cms"`, so a missing
publication dependency cannot silently fall back to bundled content.

Admin additionally requires the local `EDITORIAL` binding for
`EditorialDraftStore`, with only its `editorial-v1` SQLite-class bootstrap. It
cannot reference another Worker or namespace. Both configs may include `ASSETS`
with an explicit directory and `run_worker_first: true`; every file in that
directory must appear in the hashed artifact inventory.

Everything else fails the positive allowlist: additional DB/KV bindings,
`COMMAND_RELAY`, Life or other services, external DOs, queues, email bindings,
cron triggers, secret-store bindings, unknown vars, publisher keys, unsafe
metadata, build commands, custom routes, and nested environments. This initial
profile prepares synthetic CMS reader and disabled-writer tests. It does not
configure full owner authentication or every production application dependency.

An explicit `publicationProfile: "direct"` fails with
`unsupported_public_verification_target`. The current direct publisher verifies
readiness, routes, and media against `https://anipotts.com`. An isolated database
and bucket do not make those verification requests target the isolated reader.
Do not enable direct activation in this profile or describe its receipt as an
end-to-end publication proof. A separately reviewed verification-target contract
and narrow owner acceptance setup must exist first; service identities must not
be granted owner privileges to bypass that prerequisite.

The protected resource list includes the configured production Worker names,
shared `anipotts-db` UUID `a8aadf73-bbf4-447c-97db-cb3e50b4e26f`, and the earlier
audit's dedicated publication UUID `2679fc97-e251-46b7-ad01-db8b9fe04e8d` and
`anipotts-content-media` bucket. A fixture-looking alias cannot bypass the UUID
check. Unknown resource ownership still requires actual provider metadata.

## Receipt, limits, and remaining gates

The receipt says `status: "configuration-only"` and binds manifest/bundle hashes,
run owner, PR, expiry, `publicationProfile: "disabled"`, and `assertedSourceSha`. It always reports all of the
following as false:

- `artifactProvenanceVerified` and `moduleClosureVerified`
- `syntheticContentVerified` and `ownerApprovalVerified`
- `providerOwnershipVerified` and `cloudRuntimeVerified`
- `mutationAuthorized`

Hashing files proves their identity during this read. It does not prove the
asserted source commit produced them, that imports form a valid self-contained
Worker, that runtime code has no outbound effects, or that provider names/IDs
belong to this run. The preflight does not add a JavaScript import parser or run
a bundler. Existing build/module validation and real isolated runtime acceptance
must establish those facts before cloud execution.

The exported `validateContentReleaseIsolation` function accepts
`{ bundleRoot, manifestPath, expectedManifestSha256, previousReceipt, now }`.
Revalidation always rereads/hashes the files. When `previousReceipt` is supplied,
its manifest and bundle digests must also match. Editing a config, module, asset,
migration, or fixture invalidates the old receipt, even if someone updates the
new manifest's file hashes. Recheck immediately before any separately approved
action; there is no mutation runner or filesystem locking guarantee in this
slice.

The validator limits JSON files to 128 KiB each, individual artifacts to 16 MiB,
total read bytes to 128 MiB, declared artifacts to 1,024, visited directory entries
to 2,048, and directory depth to 16. Oversized or unreadable bundles fail without
partial approval. These are local preflight limits, not provider quota claims.

Required external gates remain: review synthetic fixture contents; obtain Ani's
PR approval; match artifacts to the exact reviewed build; verify complete module
loading; inspect actual provider resource IDs, Worker versions and bindings;
then demonstrate the intended D1/DO/R2 behavior in those isolated resources.
The existing publication migration and schema-result proofs remain useful
separate checks. Local SQLite or supplied schema JSON alone does not establish
cloud transaction atomicity, resource ownership, durable alarms, or restoration.

No permanent staging replacement, provider access change, resource purchase,
secret handling, deployment command, teardown automation, or authored-data
deletion is introduced here.

The initial bounds were checked against a current local production build:
Admin output contained 585 files / 69,302,496 bytes and public output contained
145 files / 6,490,350 bytes. This measurement sets headroom for a complete
reviewed bundle; it is not approval to copy real content into a synthetic test.
The earlier 512-file / 64 MiB proposal would have rejected that combined output.
