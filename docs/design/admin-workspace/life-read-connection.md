# Life read connection for Website review

Status: proposal, not an access grant. No new listener, issuer, key, session,
source enrollment or browser connection is activated. Website owns integration
and release; System owns the PersonalContext host and service.

## First stage

Connect the Life browser directly to a dedicated private HTTPS read gateway on
Mini. The admin origin remains `https://admin.anipotts.com`. Private requests and
responses do not pass through the public Astro server, editorial storage or
Operations telemetry. The first stage enables `status`, `sources`, `search` and
`get` only. Timeline, context preview and activity remain disconnected until
separately included in a reviewed grant.

Candidate listener: a dedicated loopback service behind Mini's tailnet HTTPS
Serve port 18444, prefix `/life/v1/read`. This is a candidate, not a reservation.
System must supply the current exact HTTPS host and confirm the port before the
approval packet is complete. Preserve existing Serve port 18443 and unrelated
services. No public listener or Funnel route. The database root is fixed in the
service deployment configuration; request parameters cannot choose a root.

## Owner and session

Candidate subject is `ani`, matching the maintained passkey owner ID in
`apps/admin/src/lib/passkey-auth.ts`. Website must verify that the active
production principal uses that ID before binding it. Require exact subject,
active owner account, a valid unrestricted passkey-authenticated admin session,
and a separate explicit `life:read` grant. Being any owner, an operator, a
viewer, a recovery session, or a local Codex client is insufficient.

Propose an asymmetrically signed 60-second bearer ticket issued by Website after
those checks. Fixed issuer `https://admin.anipotts.com`, audience
`personal-context-life-read`, exact subject `ani`, grant version, session ID,
issued-at and expiry claims, and exact method allowlist. The gateway pins the
verification key and algorithm in deployment configuration; reject request
supplied key URLs and algorithms. Keys and grant creation require the later
specific access approval. Do not reuse editorial or Codex credentials.

Keep tickets, queries and results in browser memory only. Renewal requires the
same live principal and grant. Logout, lock, expiry and authorization denial
clear results and cancel pending requests; reject late completions. A revoked
grant prevents renewal. Without a revocation channel an issued ticket remains
usable until its expiry, at most 60 seconds; this is an explicit limitation.

## Read contract and sources

Use `POST /life/v1/read` with JSON `{method, args}` and an Authorization header.
POST carries a read request; it does not permit any record write. Search text is
never placed in URLs, history, persistent browser storage or server logs.

- `status`: reader/source availability only, not arbitrary host diagnostics.
- `sources`: coverage and provenance of sources admitted by this grant only.
- `search`: explicit query, optional person/project/place kind; 30-row pages.
- `get`: an admitted record ID and bounded body offset, returning provenance,
  revision, classification, effective and observed dates, uncertainty,
  corrections and omissions alongside the body.

Pin the approved source ID allowlist in private deployment configuration, derived
from the reviewed source inventory. Do not grant the whole database by default.
Apply `closed` and `process: never` exclusions before search, counts and lookup.
Health, legal, financial and other separately restricted sources remain excluded
unless the exact source is explicitly approved. A record ID cannot bypass source
or classification checks. Metadata-only discovery remains metadata-only.
No enrichment, ingestion, export, correction, approval or publication operation.

The first approval packet must include the concrete source allowlist and store
root through a private review surface, not personal records in public Git.

## Transport and denial evidence

Allow only the exact admin Origin, POST and required content/authorization
headers. Reject absent, null and other origins. CORS is an additional browser
constraint, not authentication. Tailnet reachability and proxy identity headers
are insufficient authorization. Verify tickets on every request before opening
records; do not trust user identity in a forwarded header.

Reject redirects before following them. Limit the request body, enforce existing
query and cursor bounds, use a five-second deadline and a one-MiB streamed response
cap before JSON decoding. Return `Cache-Control: private, no-store`; prohibit
service-worker caching, raw request/error logging and analytics capture. Errors
expose a stable reason category, never private response text. Transport failures
may preserve displayed results only while the session is still valid.

Before activating private data, synthetic tests must prove: missing, expired,
wrong-subject and revoked-grant tickets; wrong audience/issuer/algorithm/key;
role-only and recovery-session denial; spoofed headers; unsupported methods;
wrong origin; request-controlled roots/scopes; excluded-source IDs and counts;
redirects, malformed/oversized bodies and timeouts; logout/expiry during a read;
and absence of queries, bodies and credentials from logs and browser persistence.

Prove direct transport on Ani's Mac and phone with synthetic data, including
normal browser local-network rules, tailnet disconnect and reconnect. Do not
weaken browser protections. A public proxy or second admin shell would change
this proposal and require a separate decision.

## Activation handoff still required

System: exact private hostname/port, fixed store root, source allowlist and
service configuration. Website: confirmed principal binding, reviewed issuer and
session lifecycle implementation. Together: immutable code hash, synthetic test
receipt, Mac/phone transport evidence and rollback that disables this dedicated
route and grant while preserving existing services. Only then request approval
for that exact network and data-access boundary. This document alone is not an
activation-ready packet.
