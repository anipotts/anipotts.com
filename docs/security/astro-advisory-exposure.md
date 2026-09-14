# Astro advisory exposure

Recorded September 14, 2026. Lockfile and config line references are to this branch after merging `origin/main` at `61b580c1`.

Both apps install astro 5.18.2 with @astrojs/cloudflare 12.6.13. Admin also
installs @astrojs/react 4.4.2. Scanners flag three Astro advisories against that
version. Each sink was traced through the installed packages and is unreachable
in both workers. The Astro major upgrade is scheduled separately.

`config/astro/advisory-guard.mjs` is an Astro integration in both apps. It fails
every build, including CI and deploy builds, when the resolved config or the
real module graph would make any of them reachable before that upgrade. In the
dev server a config violation stops startup, and a module or slot violation
returns a 500 for the affected request with the advisory in the terminal.

| Advisory            | Severity | Affected      | First fixed | www           | admin         |
| ------------------- | -------- | ------------- | ----------- | ------------- | ------------- |
| GHSA-26w7-cxv4-gfx2 | critical | astro < 7.2.8 | 7.2.8       | not reachable | not reachable |
| GHSA-2pvr-wf23-7pc7 | high     | astro < 6.4.6 | 6.4.6       | not reachable | not reachable |
| GHSA-8hv8-536x-4wqp | high     | astro < 6.3.3 | 6.3.3       | not reachable | not reachable |

Installed-package references point into `node_modules/astro/dist` and
`node_modules/@astrojs/cloudflare/dist` as installed for each app. The www and
admin copies are identical.

## GHSA-26w7-cxv4-gfx2: AVIF decoding through sharp

Summary: libheif inside sharp's bundled libvips can be driven to out-of-bounds
reads and writes by a crafted AVIF, giving remote code execution when Astro's
sharp image service decodes an untrusted image. The upstream fix
(withastro/astro `ecb40821`) changes no Astro code. It raises Astro's optional
sharp dependency to `^0.35.4`.

Affected range: astro < 7.2.8.

Installed versions: astro 5.18.2 resolves sharp 0.34.5 as an optional
dependency (`pnpm-lock.yaml:8408` and `:8510`). sharp 0.34.5 bundles
@img/sharp-libvips 1.2.4, whose `versions.json` records libheif 1.20.2. The
linked libheif advisory GHSA-g89c-p67h-r497 covers libheif 1.22.0 through
1.23.1, so Astro's own sharp copy is outside that range. This was read from the
installed darwin-arm64 package; Linux builds of the same libvips release are
assumed to bundle the same libheif.

Why it is not reachable:

- Astro imports sharp in one place, `dist/assets/services/sharp.js:16`, and only
  loads that file when the image service entrypoint is
  `astro/assets/services/sharp`.
- Both apps set `imageService: "passthrough"`: `apps/www/astro.config.mjs:27`
  and `apps/admin/astro.config.mjs:64`. The adapter maps that value to
  `passthroughImageService()` for every command (`dist/utils/image-config.js:4-5`,
  called from `dist/index.js:96`), which is `astro/assets/services/noop`
  (astro `dist/config/entrypoint.js:12-17`). The noop `transform` returns the
  input bytes unchanged (`dist/assets/services/noop.js:15-20`).
- Neither config has an `image` block, so `image.domains` and
  `image.remotePatterns` are empty and the injected `/_image` endpoint refuses
  remote sources.
- No source under `apps/*/src` or `packages/*/src` imports `astro:assets` or
  sharp, calls `getImage`, or renders `<Image>` or `<Picture>`. Site images live
  in `apps/www/public/images` and ship verbatim.
- Admin media uploads accept only JPEG, PNG and WebP by magic bytes
  (`apps/admin/src/editorial/media-store.ts:12-31`, rejected at `:46`) and are
  stored without decoding. An AVIF fails that check.
- The workers run on workerd, where the adapter states sharp is unsupported at
  runtime (`dist/index.js:140`).

Outside this advisory: miniflare 5 alpha resolves sharp 0.35.2
(`pnpm-lock.yaml:10109` and `:10121`), which bundles libheif 1.23.0, inside the
libheif range. Miniflare loads it only to emulate an `[images]` binding or a
`cf.image` fetch in local development, and neither is configured or used. The
Astro upgrade does not change that copy, so this guard does not cover it.

Guard rule, per app while its installed astro is below 7.2.8:

- `astro:config:done`: the resolved `config.adapter.name` is
  `@astrojs/cloudflare`, the resolved `config.image.service.entrypoint` is
  `astro/assets/services/noop`, and `config.image.domains` and
  `config.image.remotePatterns` are empty. `imageService: "compile"` resolves to
  `astro/assets/services/sharp` and `"cloudflare"` to
  `@astrojs/cloudflare/image-service`, so both fail.
- Vite `resolveId`: an authored module (`.astro`, `.mdx`, `.js`, `.jsx`, `.ts`,
  `.tsx` and their `m`/`c` variants) under `apps/*/src` or `packages/*/src`
  does not import `astro:assets`, `astro/assets`, `astro/assets/services/sharp`
  or `sharp`.

Remove the rule after the Astro 7 upgrade, once both apps install astro 7.2.8 or
later.

## GHSA-2pvr-wf23-7pc7: Host header SSRF in prerendered error page fetch

Summary: when a request falls through to a prerendered 404 or 500 route, Astro
builds the error page URL from `request.url`, whose host comes from the Host
header, and fetches it with `prerenderedErrorPageFetch`. That option falls back
to global fetch (astro `dist/core/app/index.js:308`, used at `:460-473`). A
server that calls `app.render` without overriding it can be pointed at an
attacker-chosen host. The advisory lists @astrojs/cloudflare as not affected.

Affected range: astro < 6.4.6.

Installed versions: astro 5.18.2 and @astrojs/cloudflare 12.6.13 in both apps.

Why it is not reachable:

- The adapter's handler always passes
  `prerenderedErrorPageFetch: (url) => env.ASSETS.fetch(...)`
  (`dist/utils/handler.js:40-48`). Its server entry
  (`dist/entrypoints/server.js:3-8`) is the only code in the adapter that
  creates an App and renders. The static assets binding matches on pathname
  only, so the Host cannot send the fetch anywhere else.
- www uses the adapter's default entry (`apps/www/astro.config.mjs:25-28`).
  `src/pages/404.astro` is prerendered, so the 404 branch can run, but it reads
  through ASSETS (`apps/www/wrangler.toml:32-37`). `/500` matches only
  `src/pages/[...catchall].ts`, which is on demand (`prerender = false` at `:3`),
  so errors render in process.
- admin sets `workerEntryPoint: ./src/worker.ts`
  (`apps/admin/astro.config.mjs:58-65`). That file only spreads the adapter's
  `createExports` and adds `EditorialDraftStore`
  (`apps/admin/src/worker.ts:2-6`). Admin has no 404 or 500 page, so Astro's
  injected default 404 is not prerendered and the fetch branch never runs.
- No source imports `astro/app`, `astro/app/node` or `@astrojs/node`, or
  references `NodeApp` or `createRequestFromNodeRequest`.

Guard rule, per app while its installed astro is below 6.4.6:

- `astro:config:done`: the resolved `config.adapter.name` is
  `@astrojs/cloudflare`, whose handler always passes the ASSETS-backed
  `prerenderedErrorPageFetch`.
- Vite `resolveId`: an authored module under `apps/*/src` or `packages/*/src`,
  which includes admin's `src/worker.ts`, does not import `astro/app` or
  `astro/app/node`.

Remove the rule after the Astro 7 upgrade, once both apps install astro 6.4.6 or
later.

## GHSA-8hv8-536x-4wqp: reflected XSS through slot names

Summary: for a hydrated framework component, Astro writes each named slot's key
into `<template data-astro-template="KEY">` without escaping (astro
`dist/runtime/server/render/component.js:293`; the file imports only
`markHTMLString` at `:3`). A slot name taken from request input can break out of
the attribute. Exploitation needs SSR, a framework renderer, a `client:*`
component and a request-derived named slot.

Affected range: astro < 6.3.3.

Installed versions: astro 5.18.2 in both apps, plus @astrojs/react 4.4.2 in
admin.

Why it is not reachable:

- The sink sits after the early return for components without a hydration
  directive (`component.js:246`) and skips the key `default`.
- www is `output: "static"` with astro-icon, the advisory guard and no framework
  renderer (`apps/www/astro.config.mjs:13` and `:29-31`), so it has no hydrated
  islands.
- admin meets the other preconditions, but no `.astro` file sets a `slot`
  attribute. The two hydrated components with children pass only an unnamed
  `<slot />` (`apps/admin/src/layouts/AdminLayout.astro:78-90` and
  `apps/admin/src/layouts/EditorialLayout.astro:83-85`), whose key is `default`.
- Request data reaches islands only as props, for example `librarySearch` at
  `EditorialLayout.astro:56`, which are serialized and escaped on a separate
  path.
- `Astro.slots.has("default")` at `EditorialLayout.astro:43` uses a literal
  name, and `slots.has` and `slots.render` never write the name.
- React's attribute escaping is not a mitigation. An escaped key fails the
  comparison at `component.js:283`, which routes it into the line 293 sink.

Guard rule, per app while its installed astro is below 6.3.3, over each `.astro`
file under `apps/*/src` or `packages/*/src` that the build or dev server loads:

- a `slot` attribute value is a plain string literal: `slot="x"`, `slot='x'`,
  `slot={"x"}` or a backtick value without `${`. `slot={name}`, `slot = {name}`
  and `slot={open ? "a" : "b"}` all fail, including a ternary between two
  literals.
- `Astro.slots.render(` and `Astro.slots.has(` take a string literal as their
  first argument.

Remove the rule after the Astro 7 upgrade, once both apps install astro 6.3.3 or
later.

## Guard operation

`config/astro/advisory-guard.mjs` exports one Astro integration. Both
`apps/www/astro.config.mjs` and `apps/admin/astro.config.mjs` list it in
`integrations`, so it runs in every `astro build`, `astro dev` and `astro check`
for either app: local builds, `pnpm validate`, the CI build step and both deploy
jobs. It reads only files Astro and Vite already load. The Security Review
workflow does not run it.

- Version gating. At `astro:config:setup` the integration resolves
  `astro/package.json` from the app root with `createRequire` and turns each rule
  off once that version reaches the advisory's first fixed version. A prerelease
  of the fixed version and an unreadable version keep the rule on. With every
  rule off it adds no plugin, checks nothing and logs nothing.
- Resolved config. `astro:config:done` runs after every integration's
  `updateConfig`, including the adapter's image service mapping, so it checks the
  final values rather than the options object. A failure throws
  `AstroAdvisoryError` with the advisory id in the message and the fix in the
  hint, for example
  `GHSA-26w7-cxv4-gfx2: resolved image service is "astro/assets/services/sharp", not astro/assets/services/noop.`
- Module graph. A Vite plugin with `enforce: "pre"` checks `resolveId` calls
  before Astro's own resolvers. The importer must be a real file under
  `apps/*/src` or `packages/*/src` after symlinks are resolved, so pnpm-linked
  workspace packages count as `packages/*/src` and virtual `\0` ids,
  `node_modules`, generated `.astro` directories and package `dist` output never
  match. Only authored module types are checked: Astro compiles `.md` pages into
  modules that import `astro:assets` for images and `.svg` imports into modules
  that import `astro/assets/runtime`, and neither is written by an author. An
  unused import in `.astro` frontmatter is dropped by the compiler and never
  resolves. In `.ts` and `.tsx`, `verbatimModuleSyntax` keeps unused and inline
  `type` imports, so they still fail; use `import type { ... }` for types.
- Slots. A `transform` hook on `.astro` ids under those source roots reads the
  file from disk. Astro's own pre plugin compiles `.astro` before this hook
  runs, so the code Vite passes in is already JavaScript. Frontmatter is blanked
  before the attribute match, and a `const`, `let` or `var` declaration named
  `slot` is not an attribute. Everything else is fail-closed: an HTML comment or
  client script text shaped like `slot={x}` fails.
- Failures print as
  `GHSA-8hv8-536x-4wqp: apps/admin/src/layouts/AdminLayout.astro:90 slot attribute value is not a string literal. Fix: ...`
  and stop the build. In dev the affected request returns 500 with the same
  message in the terminal.
- Release scope. `config/astro/**` is a turbo global dependency, so a guard
  change invalidates every cached build. `scripts/ci/release-policy.mjs` maps it
  to the `www` and `admin` deploy targets, so merging a guard change deploys both
  apps.
- Tests: `node --test config/astro/advisory-guard.test.mjs`, which
  `pnpm test:workflows` and `pnpm test:ci-invariants` include.

Not covered: files Vite never loads, sources outside `apps/*/src` and
`packages/*/src`, and a slot name passed through a spread attribute.

After the Astro 7 upgrade lands, delete `config/astro/advisory-guard.mjs` and its
test, the import and `integrations` entry in both `astro.config.mjs` files, the
`config/astro/**` entries in `turbo.json` and `scripts/ci/release-policy.mjs`
with their test cases, the test in `test:workflows`, and this document.

## Recorded for Ani, not changed here

- `apps/www/wrangler.toml:9` sets `workers_dev = true`, so the www worker also
  answers on its workers.dev hostname in addition to the custom domains at
  `:17-30`. None of these advisories is reachable there. Admin sets
  `workers_dev = false` (`apps/admin/wrangler.toml:6`).
- This record describes `origin/main` source and the installed packages. The
  deployed worker bundles were not compared against it.
- Cloudflare Access in front of admin is not verifiable from the repository and
  is not counted as a mitigation here.
