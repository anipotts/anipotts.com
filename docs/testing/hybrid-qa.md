# hybrid web qa

the site keeps its Node, Vitest, Bun, Astro and workerd contract tests. the e2e
suite adds browser evidence for user journeys that those tests cannot see.
`e2e` is pinned because its pre-1.0 API can change between minor releases.

## current coverage

| surface                   | exact checks                                                               | browser journeys                                                                         | remaining boundary                                                            |
| ------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| public content and routes | content schemas, built output, endpoint tests, local CMS workerd/D1 smokes | navigation, published article/project discovery, narrow menu                             | no public search control or newsletter form exists in this app                |
| admin                     | component, Astro render, editorial workerd and access tests                | local owner library, record and synthetic reader states; local interrupted-edit recovery | CI cannot activate the owner flag; real Access and provider data are separate |
| retained workers and CI   | Bun/Node contract, release and security tests                              | none                                                                                     | browser goals are not a useful substitute for these exact contracts           |

the two public workerd smokes and the deterministic public browser suite run
after affected builds in the existing ready-PR CI job. agent goals are local
and opt-in. no model credential is supplied to CI. browser results establish
responsive behavior at their configured widths, not physical phone touch.

## run

use Node 24.19.0 and `pnpm install --frozen-lockfile`. on a new machine install
the browser binaries with `pnpm exec playwright install chromium webkit`.

```sh
pnpm --filter @anipotts/www test:runtime
pnpm --filter @anipotts/www test:cms-routes
pnpm test:e2e:www
pnpm test:e2e:admin:local
```

the public e2e command builds the site, then starts a task-owned local Worker
with a temporary seeded D1. it has no remote Cloudflare bindings. the admin
command starts an Astro dev server on loopback with the existing local owner
flag. that flag is rejected in GitHub Actions and never enters a deployable
bundle. admin tests use committed synthetic fixtures and local state. they must
not use private writing or a live provider.

for local agent goals, sign in through the framework's native ChatGPT flow,
then run the relevant command. this sign-in is an account action and remains
user-controlled. `E2E_MODEL` can select an available model id from
`pnpm exec e2e models openai`.

```sh
pnpm exec e2e login openai
pnpm test:e2e:www:agent
pnpm test:e2e:admin:agent
```

the runner keeps reports, screenshots and replay recordings under ignored
`.e2e/`. review them before sharing: observed screen content can appear in
artifacts, and non-secret typed values can appear in recordings. CI disables
framework telemetry and runs only the deterministic file. its report is local
to the CI runner until an approved artifact policy is added.

## goal prompt for coding agents

> on the named local route and viewport, complete one visitor or synthetic
> owner goal using visible controls. do not send, publish, delete, change
> access, or touch remote services. write one `agent.act` step for the goal,
> followed by an exact locator or URL assertion for the required outcome.
> report the route, viewport, action path, failed assertion, and browser
> evidence. if the requested control does not exist, report the gap rather
> than inventing a flow.

when a feature changes, add or update the smallest journey that could catch a
wrong outcome. keep exact boundary tests for validation, access, publication,
and worker behavior. replace a source-string or markup assertion only after a
new test has shown it fails on a representative regression. record each pilot
run's duration, retries, model calls, and defects before widening agent use.

for full admin visual acceptance, inspect 320, 390, 768, 792, 1024, 1280 and
1440px, light/dark/system, keyboard order, 200% zoom and reduced motion on the
real local components. keep that evidence separate from CI's desktop and 390px
browser targets and from any live production proof.

## pilot evidence, 2026-10-03

| run                                                       | outcome                           | elapsed                            | retries | model calls | issue found                                                                                                     |
| --------------------------------------------------------- | --------------------------------- | ---------------------------------- | ------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| public deterministic, Chromium and 390px WebKit           | 7 passed, 1 expected desktop skip | 22s                                | 0       | 0           | the narrow menu closes after navigation, so the test must reopen it before checking the active link             |
| admin deterministic, serialized Chromium and 390px WebKit | 10 passed                         | 106s, including 42s server startup | 0       | 0           | parallel browsers on one cold Astro server observed loading placeholders; this local suite runs with one worker |
| deliberately false public heading, Chromium               | failed as expected                | 16s                                | 0       | 0           | wrong visible outcome produced an assertion failure and a screen artifact; the temporary test was removed       |

the two public workerd smokes passed locally. `test:cms-routes` checked 84 of
84 routes after its capability assertion was updated to runtime version 2;
the current endpoint no longer returns a bundled digest. the local agent goal
files were listed and typechecked, but no ChatGPT account was authenticated or
model goal executed for this pilot.

synthetic admin screenshots were captured and reviewed in light and dark at
393, 768 and 1280px for the content library, Operations status and Data
records. extra reduced-motion checks at 320, 792, 1024 and 1440px found no
horizontal document overflow, and the first Tab reached the skip link. a CSS
zoom approximation at 792px was also captured; it does not prove native 200%
browser zoom or physical touch behavior. those remain manual acceptance checks.
