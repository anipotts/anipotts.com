# Build environment setup handoff

Paste the following into the Codex **Edit build** setup chat. That chat must
apply supported environment settings, not merely modify repository documents.
The website completion chat can read configuration but has no configuration
write tool. On October 10, the latest enforced revision 12 still allowed only the package
manager preset and `cdn.playwright.dev`, with no secret bindings or identities.

> Finish configuring and publish the existing `build` cloud environment for
> `anipotts/anipotts.com` end to end. Preserve its existing repositories,
> toolchains, setup commands and writable cache paths. Keep Node 24.19.0 and
> pnpm 10.5.2 for this repository, using its existing activation script.
>
> Preserve the package-manager network preset and `cdn.playwright.dev`. Add
> `anipotts.com`, `www.anipotts.com`, `admin.anipotts.com`, `api.anipotts.com`,
> `agents.anipotts.com`, `staging.anipotts.com`, `api.github.com`,
> `api.cloudflare.com`, `storage.googleapis.com` and the existing owner Access
> host `anipotts.cloudflareaccess.com`. Add only the exact Google sign-in hosts
> required by the existing login flow. The Playwright CDN redirects to Google
> storage; allowing the CDN alone does not complete browser installation.
>
> Enable the supported secure GitHub repository integration. Verify repository
> reads and agent-branch push capability without printing credentials. Do not
> paste tokens into chats, files or setup commands. Keep Cloudflare deployment
> secrets in the protected GitHub Actions Production environment. For provider
> inventory, use a separately scoped read-only Cloudflare credential through
> supported secret settings, if available; do not grant account-wide writes.
>
> Save and publish the environment configuration, start a fresh task using it,
> and verify the enforced host policy and credential readiness. Check the
> supported versions and representative non-mutating tasks for its existing
> repositories. Install the repository-matching Playwright Chromium and launch
> it. Issue bounded read-only website requests; inspect release/version headers
> and record which checks succeeded, failed or still need owner interaction.
>
> Preserve Cloudflare Access and the exact-owner sign-in boundary. Network
> access does not authorize reading private drafts or health data. Mac worktrees
> and private readers require their supported device/VPN access and exact grants;
> public host access does not make them reachable. Report that separately.
>
> This is environment setup only. Do not merge website PRs, approve Production,
> deploy, alter DNS or Access, publish CMS content, send messages, change billing
> or remove resources. The website's source preparation is approved, while its
> exact #521 release has completed; subsequent deployments remain separately held.
> Finish with the published configuration version, fresh verification results
> and any concrete remaining owner action. If a required setting cannot be
> changed by your tools, identify that exact setting and where to apply it;
> do not report the environment as ready before it is enforced and tested.
