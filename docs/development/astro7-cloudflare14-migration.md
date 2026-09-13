# Astro 7 / Cloudflare 14 migration candidate

This branch is an integration candidate, not release-ready. It is based on
main `dcca7160ac9e1762eeeabb09a3c68f93a4316747` (PR #339).

## Versions and rationale

Astro 7.2.8 with Cloudflare adapter 14.3.1 fails compilation: the adapter imports
`renderForPrerender` from `astro/app`, which 7.2.8 does not export. This candidate
uses Astro 7.3.2, the adapter's own development dependency, with adapter 14.3.1,
React integration 6.0.5, markdown-remark 7.3.0, and Wrangler 4.131.1.

Official migration references:

- https://docs.astro.build/en/guides/upgrade-to/v6/
- https://docs.astro.build/en/guides/upgrade-to/v7/
- https://docs.astro.build/en/guides/integrations-guide/cloudflare/#upgrading-to-v13-and-astro-6

The Worker entrypoint now uses the standard fetch handler and retains the
EditorialDraftStore named export. Wrangler source configuration points at source
entrypoints; the adapter emits deployment configuration under dist/server and
public files under dist/client. Existing resource names, routes, D1 bindings,
Durable Object bindings and migration tags are unchanged. No provider action
has been performed. Deployment tooling must use the generated configuration
through the adapter's .wrangler/deploy/config.json redirect.

Application middleware supplies the previous locals.runtime.env interface from
cloudflare:workers on rendered requests. Auth and draft handlers retain their
existing implementation. This preserves the source contract, but is not proof
of authenticated runtime parity. session:false prevents the adapter's unused
SESSION KV default; application cookies, passkeys and Access remain separately
implemented and still require live parity verification.

Prerendering remains in Node to preserve the previous build environment. Thin
app-local Zod 4 wrappers call the unchanged shared Zod 3 validators, retaining
parsed defaults, transformations, rejection messages and issue paths. Tests
exercise valid and invalid inputs. JSON schema generation for transformed
schemas may remain less descriptive than native Zod 4 object schemas.

## Verification and remaining gates

On the rebased main baseline, both app builds passed (5 scoped tasks) and both
app typechecks passed (8 scoped tasks). Public artifact assertions use the new
client directory. Admin preview manager invariant tests passed. These checks
precede the final extraction of the schema wrappers into independently tested
helpers; wrapper behavior and the public tests passed after extraction.

Before rebasing, 251 admin unit tests and 89 Worker tests passed. Do not interpret
those counts as coverage of PR #339. The first post-rebase unit rerun hit ENOSPC;
a bounded rerun completed 601/605 tests, with four logout middleware tests
failing on the new Cloudflare import in Node. Adding a binding mock and complete
locals test context fixed all four in a focused rerun. Public tests pass 6/6,
including both schema bridges. Disk exhaustion also prevents
unbounded rebuilds; no full workspace validate or provider dry-run is claimed.

The major unresolved blocker is development runtime parity. Adapter 14 runs
server routes in workerd. The local editorial fallback currently imports
Miniflare, esbuild and host filesystem APIs to open persistent local SQLite and
read source files. That Node-hosted path has not been migrated or proven inside
workerd. Managed preview startup, local autosave/recovery, private draft custody,
and authenticated binding behavior must pass before integration or closing the
superseded dependency PRs. No real drafts were published or edited for testing,
and the canonical managed preview was not changed.
