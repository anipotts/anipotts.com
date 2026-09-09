# Editorial publishing activation

The release connects `admin.anipotts.com` to canonical Markdown in `anipotts/anipotts.com`. Private saves stay in the `EditorialDraftStore` SQLite Durable Object. Publish freezes one revision, discloses that source in a signed GitHub change, waits for protected checks and native merge, then verifies the deployed release and exact source before showing live.

## Prepared configuration

- GitHub owner: `anipotts`; repository: `anipotts/anipotts.com` (1107959197).
- Dedicated private GitHub App: `anipotts editorial publisher`. [Permission manifest](../config/editorial-github-app.json). Install on this repository only. No organization permissions, active webhook, workflow write permission, or branch-protection bypass. GitHub's manifest schema requires a URL in the disabled webhook object; it names the existing admin origin and does not add a receiver.
- App logo: the existing white AP Structural mark on blue from `apps/www/public/brand/ap-favicon.svg`, exported at 2048 × 2048 into `.local/editorial-publisher-logo-2048.png`. Ani selected this logo during setup.
- App permissions: contents and pull requests write; actions, administration, checks, statuses, deployments and metadata read. Administration read inspects protection; it cannot modify repository policy.
- Cloudflare account: `0f856093bdcd34a7da1bde5ee4385163`; Worker: `anipotts-admin`; domain: `admin.anipotts.com`.
- Runtime App identifiers: `EDITORIAL_GITHUB_APP_ID` and `EDITORIAL_GITHUB_INSTALLATION_ID`.
- Private Worker bindings: `EDITORIAL_GITHUB_PRIVATE_KEY` and `EDITORIAL_SIGNING_PRIVATE_KEY`. The latter is a distinct RSA publication-signing key; only its public half belongs in `.github/editorial-publisher.pem`.
- Owner: `hello@anipotts.com` through `https://anipotts.cloudflareaccess.com`. Verify the actual application policy and audience before changing `ACCESS_POLICY_AUD`. Signed application assertions establish identity; service-token assertions cannot access the editor.
- The additive `editorial-v1` migration creates the SQLite Durable Object. Existing D1, command relay and newsletter resources remain in place.

## Verified provider state

The signed-in Cloudflare Browser on September 8 showed the existing `admin.anipotts.com` application (`69e90546-e54c-4fd9-b589-2c2f2350d3de`) protecting the whole hostname. Its only policy, `Allow Ani` (`a231936f-a6da-439e-9c8c-87754aeeaf6c`), allows only `hello@anipotts.com`. The application audience matches `ACCESS_POLICY_AUD` in the checked Worker configuration. No Access policy change is needed or was made.

Ani registered App `4879372` and authorized its installation and private-key setup. Installation `160192316` selects only `anipotts/anipotts.com`; the prepared read/write permissions were verified in GitHub. The white AP logo and blue badge background are applied. The App private key and distinct RSA publication-signing key are stored in the Agent Runtime 1Password vault, verified through the value-silent broker, and installed as the two named Worker secrets. No existing secrets were replaced. Public SHA-256 fingerprints (SPKI DER):

- GitHub App key: `TtI0nDzpJSyBrDRIZZt835hFlhcpXmXjNAGUbFM3V6o=`.
- Publication key: `h/tT5RQ6a6pZ0xcLRWfQokyLJpBpRE/CCzSahjaPU8s=`.

GitHub's REST response omits bypass actors for the App's read-only administration permission. The verifier uses the documented GraphQL ruleset connection when that field is absent, requiring the exact ruleset identity, active enforcement, zero actors and a complete page. Missing, nonempty or incomplete results still block publication. Live reads confirmed the App can mint a repository-only token and inspect these fields without administration-write permission. See [GitHub's REST caveat](https://docs.github.com/en/rest/repos/rules#get-a-repository-ruleset) and [GraphQL ruleset fields](https://docs.github.com/en/enterprise-cloud%40latest/graphql/reference/repos#repositoryruleset).

This activation enables private owner editing and the admin deploy gate. Publication remains disabled until the production owner flows pass. The signed publication manifest is classified as a known release path; changes to its trusted public verification key require review. When the base branch advances, an immutable publication blocks with instructions to stop it and publish a new edited revision; it cannot rebase silently or wait indefinitely on an already enabled auto-merge.

## Exact approval boundary

Provider setup creates a repository-scoped GitHub App/installation, creates and stores the two private keys, and may change the Cloudflare Access application protecting `admin.anipotts.com` to the verified single owner. These are credential/account/access changes and need native approval immediately before their effect under the project AGENTS.md. Existing broad fleet tokens must not be copied into the publisher. Keys must move value-silently through the approved credential broker; never print them, put them in argv or commit them.

The manifest is configuration to review, not a credential-creating executable. GitHub's native App registration can use these settings. If using its manifest flow, add a one-time state-bound callback before submitting, then consume its code value-silently. See [GitHub's manifest documentation](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest).

## Activation sequence

1. Finish local owner review in the managed `http://localhost:4311/` preview, including autosave, revision conflict, recovery and actual-page preview. The recovered native Browser verified these flows on September 8; temporary whitespace edits were restored from the original revision and the exact original subheading survived reload. The preview dependency cache is isolated from builds and checks. Preserve the existing local draft.
2. Obtain exact native setup approval. Verify or create the dedicated App, repository-only installation and private Worker secrets. Record only IDs, permission names and key fingerprints. Inspect the actual owner Access policy before any cutover.
3. Add the public signing key and verified non-secret App IDs in a reviewed PR. Enable `EDITORIAL_ENABLED`, keep `EDITORIAL_PUBLISH_ENABLED=false` until private owner flows pass. Set `editorial_admin_release=enabled` only with the reviewed owner cutover.
4. Re-read live protection and the exact PR head; require the GitHub Actions Build/lint/typecheck/test and Security Review checks, strict checking, required PRs, conversation resolution, admin enforcement, no bypass, and no force-push/deletion. Merge only through the protected provider path. The public build must include the renderer used by admin before publishing is enabled.
5. Deploy affected www/admin targets through the existing workflow. Record PR/merge SHA, workflow URL, target job results, active Worker version and release health. The editorial smoke checks deny anonymous access and compare the provider's active version to the exact release SHA. Keep the previous verified admin version for rollback; do not delete stored drafts or production data.
6. Sign in as the owner and verify private save/reload, conflicting revision behavior, history/recovery and saved home preview. Transfer the existing local draft through the authenticated save API if Ani chooses it for publication; do not overwrite a newer production draft.
7. Enable `EDITORIAL_PUBLISH_ENABLED=true` through checked configuration. Use the approved home subheading revision for the first real publication. The owner Publish action explicitly discloses that revision's source. Verify exactly one signed PR, exact-head required checks, native merge, successful www deploy and the live home text. Reload admin and confirm the job is live and the draft base matches the merge.
8. Test another saved revision remains private while the first publishes. Confirm failed publications remain recoverable. Record the actual production receipt; passing local tests or a configured button is insufficient.

## Release scope

This release includes the editor and the public renderer needed for Git-backed publication. The inherited newsletter service extraction is excluded and recoverable at `49e7526`. The separate `codex/writing-work-editorial` public-design checkpoint `0315960` remains under Ani's local review and is excluded. No newsletter sends, public test comments, or artificial public copy are needed for verification.
