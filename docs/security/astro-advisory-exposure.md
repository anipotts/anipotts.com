# Astro advisory exposure

Recorded September 14, 2026 against `origin/main` at `9a5449a8`.

Both apps install astro 5.18.2 with @astrojs/cloudflare 12.6.13. Admin also
installs @astrojs/react 4.4.2. Scanners flag three Astro advisories against that
version. Each sink was traced through the installed packages and is unreachable
in both workers. The Astro major upgrade is scheduled separately.

`scripts/ci/astro-advisory-guard.mjs` fails the required Security Review check
when a change would make any of them reachable before that upgrade.

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
dependency (`pnpm-lock.yaml:8386` and `:8488`). sharp 0.34.5 bundles
@img/sharp-libvips 1.2.4, whose `versions.json` records libheif 1.20.2. The
linked libheif advisory GHSA-g89c-p67h-r497 covers libheif 1.22.0 through
1.23.1, so Astro's own sharp copy is outside that range. This was read from the
installed darwin-arm64 package; Linux builds of the same libvips release are
assumed to bundle the same libheif.

Why it is not reachable:

- Astro imports sharp in one place, `dist/assets/services/sharp.js:16`, and only
  loads that file when the image service entrypoint is
  `astro/assets/services/sharp`.
- Both apps set `imageService: "passthrough"`: `apps/www/astro.config.mjs:26`
  and `apps/admin/astro.config.mjs:59`. The adapter maps that value to
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
(`pnpm-lock.yaml:10087` and `:10099`), which bundles libheif 1.23.0, inside the
libheif range. Miniflare loads it only to emulate an `[images]` binding or a
`cf.image` fetch in local development, and neither is configured or used. The
Astro upgrade does not change that copy, so this guard does not cover it.

Guard rule, per app while its installed astro is below 7.2.8:

- the adapter is imported from `@astrojs/cloudflare` and every `imageService`
  in its options is the literal `"passthrough"` (`image_service_not_passthrough`)
- the config does not reference `sharpImageService` or
  `astro/assets/services/sharp` (`sharp_image_service`)
- any `image` config is an inline object (`image_config_unverifiable`) without
  `domains` or `remotePatterns` (`image_remote_sources`)
- app and package sources do not import `astro:assets` (`astro_assets_import`)
  or sharp (`sharp_import`), call `getImage` (`get_image_call`), or render
  `<Image>` or `<Picture>` in `.astro` or `.mdx` (`astro_assets_component`)

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
- www uses the adapter's default entry (`apps/www/astro.config.mjs:24-27`).
  `src/pages/404.astro` is prerendered, so the 404 branch can run, but it reads
  through ASSETS (`apps/www/wrangler.toml:32-37`). `/500` matches only
  `src/pages/[...catchall].ts`, which is on demand (`prerender = false` at `:3`),
  so errors render in process.
- admin sets `workerEntryPoint: ./src/worker.ts`
  (`apps/admin/astro.config.mjs:53-60`). That file only spreads the adapter's
  `createExports` and adds `EditorialDraftStore`
  (`apps/admin/src/worker.ts:2-6`). Admin has no 404 or 500 page, so Astro's
  injected default 404 is not prerendered and the fetch branch never runs.
- No source imports `astro/app`, `astro/app/node` or `@astrojs/node`, or
  references `NodeApp` or `createRequestFromNodeRequest`.

Guard rule, per app while its installed astro is below 6.4.6:

- the adapter is imported from `@astrojs/cloudflare` (`adapter_not_cloudflare`)
- a `workerEntryPoint` is a literal relative path to an existing file
  (`worker_entry_unverifiable`)
- in any app source, package source or worker entry that imports `astro/app` or
  `astro/app/node`, or references `NodeApp` or `createRequestFromNodeRequest`,
  every `.render(` call passes `prerenderedErrorPageFetch`
  (`render_without_error_page_fetch`)
- `prerenderedErrorPageFetch` is never plain global fetch
  (`global_error_page_fetch`)

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
- www is `output: "static"` with only astro-icon and no framework renderer
  (`apps/www/astro.config.mjs:12` and `:28`), so it has no hydrated islands.
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

Guard rule, per app while its installed astro is below 6.3.3, over `.astro` and
`.mdx` files in `apps/*/src` and `packages/*/src`:

- `slot={...}` and backtick `slot` values are string literals
  (`dynamic_slot_name`)
- `Astro.slots.render`, `Astro.slots.has` and `<slot name={...}>` use string
  literal names (`dynamic_slot_lookup`)

Remove the rule after the Astro 7 upgrade, once both apps install astro 6.3.3 or
later.

## Guard operation

The Security Review workflow runs `node scripts/ci/security-review.mjs` on every
pull request, including drafts, without installing dependencies. It calls the
guard over the whole checkout. The guard reads each app's astro version from
`apps/<app>/node_modules/astro/package.json` when installed and from the
`pnpm-lock.yaml` importer otherwise. An unresolved version keeps every rule
active.

Each rule skips itself per app once that app's installed astro reaches the first
fixed version. Findings print as
`file:line advisory rule: summary (first fixed in astro X)`.

- Local run: `node scripts/ci/astro-advisory-guard.mjs`
- Tests: `pnpm test:security-review`, which `pnpm test:ci-invariants` includes

After the Astro 7 upgrade lands, delete the guard and its test, the import and
call in `scripts/ci/security-review.mjs`, the guard test in the
`test:security-review` script, and this document.

## Recorded for Ani, not changed here

- `apps/www/wrangler.toml:9` sets `workers_dev = true`, so the www worker also
  answers on its workers.dev hostname in addition to the custom domains at
  `:17-30`. None of these advisories is reachable there. Admin sets
  `workers_dev = false` (`apps/admin/wrangler.toml:6`).
- This record describes `origin/main` source and the installed packages. The
  deployed worker bundles were not compared against it.
- Cloudflare Access in front of admin is not verifiable from the repository and
  is not counted as a mitigation here.
