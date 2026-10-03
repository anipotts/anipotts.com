# security operations

This runbook covers the public site, Astro admin, and retained workers listed in
[platform architecture](../platform-architecture.md). It describes checks and
response steps. An alert is operational only after its provider state, recipient,
and delivery have been verified. A backup is recoverable only after an isolated
restore succeeds. Keep incident details and personal records in an approved
private system, not in this repository or a public issue.

## owner and evidence

Ani is the decision owner until a named delegate and reachable contact path are
recorded. Before relying on this runbook, record the on-call contact, backup
contact, recovery owner, and approval method in the private operations record.
For each incident, retain UTC times, affected routes and resources, observed
signals, deployed source SHA and Worker version, decisions, approvals, actions,
and verification. Redact tokens, assertions, personal records, and full request
bodies from tickets, chat, logs, and screenshots.

## detection contract

Configure these signals only after checking the provider supports the intended
scope and test delivery to the named recipient. Record the alert identifier,
threshold, expected volume, recipient, last delivery test, and response owner in
the private operations record. A missing integration is an unverified control.

| Signal                                      | Source to verify                                                              | First response                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Failed release or migration                 | GitHub deploy run and Cloudflare deployment state                             | Hold further promotion; compare exact release SHA and affected targets                          |
| Admin authentication or denial spike        | Cloudflare Access events and app responses                                    | Check app, IdP, alternate origins, and account health without opening private records           |
| Worker errors or repeated 401/413           | Cloudflare Worker metrics and bounded application counters                    | Separate expected denials from regressions; check cost and request volume                       |
| D1, queue, or email cost anomaly            | Cloudflare usage and provider billing or queue metrics                        | Stop optional work through approved controls; preserve evidence and normal unsubscribe behavior |
| Private reader or canary failure            | Approved System ops reader and admin canary                                   | Verify scope, parent session, reader availability, and tailnet reachability                     |
| Backup older than the agreed recovery point | System export manifest, independent-copy inventory, and D1 Time Travel window | Escalate to the recovery owner; do not claim recovery readiness from a scheduled job alone      |

Alert thresholds must be based on an observed baseline and an agreed cost or
recovery objective. Avoid paging on one invalid public request. Configure alert
payloads to contain counts, route classes, status, and correlation IDs, not
private content.

## first response

1. Confirm the signal with the provider's current state and its timestamp.
   Identify whether the issue affects public reading, admin access, content
   publishing, a retained worker, or data integrity. A green CI run or HTTP 200
   does not establish the live release or authorization state.
2. Capture the current main SHA, exact deployed version, last verified good
   version, D1 migration ledger, relevant alert and deployment IDs, and backup
   age. Use metadata and aggregate metrics. Do not fetch private records for
   diagnosis unless the authenticated owner has approved that route and scope.
3. Assign severity and an incident owner. If account compromise is suspected,
   preserve relevant logs and session metadata, then promptly ask the owner to
   authorize containment through the provider's native session revocation and
   account recovery controls. Verify a revoked session or assertion is denied
   on an approved inert route without opening private records.
4. Choose the smallest containment action that preserves the public site's
   intended reading and unsubscribe functions. Account, credential, DNS,
   Access, destructive data, and production changes require their exact native
   approval before the effect. An emergency still needs a recorded actor,
   target, expected impact, and recovery path.

## release and rollback

Use [release architecture](../release-architecture.md) and the repository agent
contract for the actual release gate. Before promotion, check the reviewed PR
head, required checks on that head, current branch protection, owner review,
Production environment rules, classified targets, migration plan, and the
previous verified deployment. Record explicit approval for any production effect
when required by the active security hardening task. A changed head needs fresh
checks and affected acceptance evidence.

After promotion, record the merge SHA, deploy run URL, targets run, targets
skipped, release SHA reported by each affected route, authenticated and denied
route proof where authorized, and the prior Worker version. Do not treat a
successful workflow as route proof. Use synthetic identities and data for
negative tests; do not probe real private records or load-test production.

For an application-only regression, restore the previously verified Worker
version for the affected target, then verify its route and release SHA. A Worker
rollback does not undo a D1 migration or content publication. Pause further
writes and reconcile the schema and content before a data restore. D1 Time
Travel or an export restore is a separate production data action requiring a
specific recovery decision and approval.

## backup restoration exercise

At the agreed cadence, the recovery owner verifies the latest export's manifest,
checksum, age, file permissions, and independent-copy location. Restore one
copy into a disposable isolated SQLite database. Check import success,
`PRAGMA integrity_check`, expected schema objects, and non-sensitive row counts.
Record elapsed time, copy age, key custody, result, and cleanup. This exercise
proves that copy is locally readable; it does not prove Cloudflare import,
production recovery time, or independent custody unless each was tested.

Before any production D1 restore, identify the exact database, Time Travel
window or export, dependent workers, publication state, write suspension,
rollback strategy, and data-loss interval. Take a fresh provider bookmark when
available. Obtain approval for the exact restore, execute through the supported
provider path, then verify schema, public published-state behavior, and
application compatibility. Reconcile queued and in-flight writes before
resuming publication.

## maintenance

Review dependency advisories against installed versions and reachable code
monthly and after dependency changes. Review Access policy and MFA,
DNS and alternate origins, API token scopes, alert delivery, backup age, and
independent restoration at least quarterly or after a relevant incident. Review
agent and connector tool grants whenever a new AI workflow can read untrusted
content or request production actions. Keep model tools read-only by default;
verify proposed write calls against an exact human-approved account, resource,
verb, and diff. Record exceptions with owner, evidence, expiry, and a recheck
date.
