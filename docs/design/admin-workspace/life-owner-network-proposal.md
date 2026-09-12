# Life owner network proposal

Status: design only. No endpoint, authentication change or private browser access
is activated by this document. Website confirmed that the complete admin remains
at `https://admin.anipotts.com`; a second private admin shell is outside the plan.

## Proposed data flow

The Life browser island sends bounded read requests directly to a dedicated,
tailnet-only HTTPS API on Mini. Private records return directly to browser memory.
The public admin server serves the application code and receives no Life query,
record body, preview or session credential. No editorial storage or Operations
database participates. No Funnel/public exposure is part of this proposal.

The deployment owner must reserve the exact HTTPS hostname, port and API prefix
against current Mini services before an activation request. The Mini database
root is fixed in an owner-only deployment file; neither requests nor browser
settings can select a filesystem root, principal or sensitivity scope.

Read-only Mini inspection on September 12 found Serve port 18443 already proxies
an existing localhost service. Preserve that reservation. Port 18444 had no TCP
listener at inspection; that observation is not a reservation or permission to
activate it. System must confirm the final endpoint and current conflicts.

## Candidate session design for Website review

Prefer a separate Life grant attached to the exact owner, with a short-lived
asymmetrically signed ticket issued by the existing admin authentication service.
This is a proposed additional capability, not a privilege inherited from ordinary
editorial login. Website owns the issuer and its approval boundary; Mini holds
only the verification key. Private query and response bodies bypass the issuer.

Proposed ticket lifetime is 60 seconds. Pin issuer, exact subject, audience,
algorithm, key identifier, allowed read methods and expiry. Reject unknown keys,
invalid signatures, missing claims and expired tickets before reading records.
Do not accept a key URL, principal, database root or algorithm supplied by a
request. Ticket renewal requires a still-valid owner session and explicit Life
grant. Browser storage is memory only; reload requires a new ticket.

The browser sends the ticket in an authorization header to a private POST read
endpoint. That endpoint accepts a bounded request envelope rather than placing
search text in a URL. CORS and browser local-network checks remain required.
Cryptographic verification removes reliance on local proxy identity headers;
it does not protect against compromise of the approved browser origin.

Revoking the issuer grant prevents renewal, but an already-issued ticket remains
usable for at most its remaining 60-second lifetime unless Mini receives a
separate revocation event. This limitation must be explicit in approval. Local
lock/logout immediately clears results, drops the ticket and cancels pending
reads. Tests must reject late completions after lock. No automatic fallback to
agent scope or a public server relay is permitted after an access failure.

The alternative is an independent passkey session issued on the private origin.
It needs its own enrollment, recovery and phone UX. Neither alternative is
implemented or approved. Signing-key creation, issuer changes and grant creation
remain native access actions after a concrete implementation is reviewable.

## Authentication contract to implement and prove

Tailnet reachability alone is insufficient. A reviewed server must authenticate
the exact approved owner identity and authorize each request against a separate,
short-lived Life session. The session issuance mechanism, exact owner identity,
lifetime and revocation mechanism remain unresolved. Editorial login and the
existing local Codex stdio grant cannot issue that session by implication.

Any proxy identity headers must come through a boundary the API can verify.
Listening on localhost and trusting a header is insufficient: another local
process could submit it. The deployment must either verify identity independently
or enforce a reviewed proxy-only transport. This is a prerequisite to approval,
not a claim that the proposed deployment already provides it.

The capability permits only the existing bounded search, get, timeline, preview,
sources and status methods, plus separately reviewed metadata-only activity.
Closed and `process: never` records remain excluded. Owner results retain
classification, provenance, uncertainty, corrections and omission metadata.

## Browser feasibility gates

- CORS allows only `https://admin.anipotts.com`, exact read methods and necessary
  headers. Reject missing, null and other origins for this browser capability.
  CORS is not authentication and does not protect a callable unauthenticated API.
- Choose session transport only after testing current Mac and phone browsers.
  Cross-site cookies, browser local-network permissions and tailnet availability
  must be demonstrated on the actual clients. Do not assume desktop success
  proves mobile access. Do not weaken browser settings to make it work.
- Keep credentials and responses out of URLs, persistent browser storage,
  service-worker caches, analytics and error reports. Use no-store responses.
  A request envelope that keeps search text out of request URLs needs a reviewed
  server contract; the current internal path adapter does not provide that.
- Fetch must reject redirects before following them, use the five-second read
  deadline and cap streamed response bytes before JSON parsing. The new
  `decodeLifeResponse` helper covers decoding only.
- Session expiry or revocation must clear displayed private results and cancel
  pending reads. A late response cannot restore data after lock/logout. Ordinary
  transient refresh failure may preserve rows only while the session is valid.

## Required synthetic evidence before private activation

Use synthetic records and no production credentials to prove absent/expired/
revoked sessions, wrong owner, spoofed proxy headers, untrusted origin, redirects,
unsupported methods, request-controlled roots/scopes, oversized responses,
closed exclusions and lock-during-read behavior. Verify logging/telemetry
contains only allowed metadata. Record Mac and phone transport feasibility.

The final native approval packet must name the exact owner, host/port, root,
origin, methods, session issuance/lifetime/revocation, deployment code hash,
service changes and rollback. It must state that private values become visible
to the browser and may enter a model context if an approved agent inspects it.
Do not request approval while those fields remain unresolved.

If this direct route cannot meet the gates, return the specific failed gate to
Ani with bounded alternatives. A private-origin shell or a public server relay
would each change the agreed deployment/data flow and need a separate decision.
