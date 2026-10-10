# Cloud website access

The October 10 completeness pass is using a ready build environment, but its
enforced network policy permits package-manager hosts and cdn.playwright.dev
only. It has no configured secret bindings or outbound identities. The exposed
cloud tool reads readiness; it cannot edit or apply the configuration.

Ani has authorized configuring site/deployment access. Apply this through the
supported Codex cloud-environment settings, preserving the package-manager preset
and existing browser-download host. Do not edit the enforced policy file, bypass
the proxy or paste credentials into chats or tracked files.

## Host access

Add the exact hosts needed for this pass:

```text
anipotts.com
www.anipotts.com
admin.anipotts.com
api.anipotts.com
agents.anipotts.com
staging.anipotts.com
api.github.com
api.cloudflare.com
storage.googleapis.com
```

Playwright 1.63.0 requests Chromium 1243 (Chrome for Testing 153.0.8010.12).
Its allowed cdn.playwright.dev download redirects to
`storage.googleapis.com/chrome-for-testing-public/153.0.8010.12/linux64/chrome-linux64.zip`.
The latter host is currently forbidden, so allowing the CDN alone does not finish
browser setup. Install the repository-required Chromium and verify an actual
launch after applying the updated policy.

For an owner browser session, also permit the existing Access team host
`anipotts.cloudflareaccess.com` and the exact selected Google login hosts shown by
the existing sign-in flow. Network access alone does not create owner authority.
Legacy/news/labs host checks may need their exact hosts added after inventory.

## Credentials and deployment

Use the supported GitHub credential integration for `anipotts/anipotts.com`.
Git branch pushes already work through the managed Git transport, and the GitHub
connector reads/writes PRs. The injected shell GH_TOKEN does not currently pass
`gh auth status`; do not replace it with a token pasted into the chat.

Production deploy secrets already belong to the protected GitHub Actions
Production environment. Normal releases should use the existing deploy workflow
and retain its required checks and approval controls. A Cloudflare deploy token
does not need to be copied into the build workspace to use that release path.

Fresh provider inventory requires a separately provisioned, scoped Cloudflare
read credential for the known account/zone. Bind it through the supported secret
integration. Do not print values or expose owner cookies in logs. Avoid adding
account-wide write permissions merely to inspect DNS, Workers, Access or stores.
Worker deployment permission alone may not grant Access/DNS inventory permission.

Reading published CMS inventory and reading private drafts are different
authorities. Do not export private records to the cloud merely to verify a
software deployment. The native editorial CLI uses the existing owner Access
session and does not introduce a new service identity.

Mac worktrees and the ap-mini private reader are not reachable by adding public
hosts. Their access needs the supported VPN/device configuration and an exact
source/device grant, or execution on the already authorized machine. Do not
claim that absent VPN failure text establishes connectivity.

## Verify after applying

Re-read environment readiness and confirm the new policy is enforced and any
credential observations are current. Verify GitHub identity without printing
tokens, issue bounded read-only requests to the public site, and inspect the
current release/version headers. Then complete authenticated owner acceptance,
provider inventory and the protected release route as their access permits.
