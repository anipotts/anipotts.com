# unified sidebar

One admin sidebar replaces the three workspace dropdowns. Content, Data and
Observability are collapsible groups in that order, each holding every page
the old per-workspace sidebar listed. This doc records what shipped in the
prototype, what was measured, and how to make page switching fast.

## what shipped

| piece       | where                                                                   | behavior                                                                                                                                                                                                                                                                                                           |
| ----------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| groups      | `apps/admin/src/components/astryx/UnifiedSidebar.tsx`                   | Content (Overview, Pages, Writing, Projects, Newsletter), Data (Overview, People, Projects, Places, Timeline, Sources, Context preview), Observability (Machines, Loops). Astryx `SideNavItem` collapsible headings, Phosphor regular icons, space between groups, no rules                                        |
| state       | `lib/admin-sidebar.ts` `sidebarGroupsState`, key `admin:sidebar-groups` | open or closed per group in `localStorage` (try/catch). The active page's group always opens on load. `aria-current="page"` on the active page                                                                                                                                                                     |
| no shift    | `prepaintAdminSidebar` + `WorkspaceHeader.css`                          | the prepaint script records closed groups on `<html data-admin-nav-closed>` before first paint; CSS holds them closed until React owns the same state, then the attribute is removed. Server markup is identical on every page                                                                                     |
| keyboard    | `UnifiedNavigation` `onKeyDown`                                         | Up and Down move through headings and pages, Home and End jump, Right opens or enters a group, Left returns to the heading or closes it, Enter and Space toggle a heading. A page opened from the keyboard gets focus back after the document loads (`sessionStorage` `admin:sidebar-focus`, keyboard clicks only) |
| rail        | desktop 769 to 1279px default                                           | groups become unlabeled icon runs separated by space, one click per page                                                                                                                                                                                                                                           |
| drawer      | 768px and below                                                         | the same three groups in the AppShell drawer, 44px rows, no horizontal overflow at 320px                                                                                                                                                                                                                           |
| switcher    | removed                                                                 | its per-tab memory stays: the Content links reached from Data or Observability keep the library's last filters and ordering (`useWorkspaceMemory`). Search now lists every sidebar page from every workspace's palette                                                                                             |
| one surface | `themes/operations.ts`, `themes/life.ts`                                | the sidebar tint is the same in every workspace, so the sidebar does not change color when you switch. Accents per workspace stay                                                                                                                                                                                  |

## measured, before and after

Method: `scripts/admin/perf-measure.mjs` against local-owner production builds
served by wrangler dev on loopback, origin/main `e4381f3d4` on one port and
this branch on another, Chromium 153 with browser defaults (paint holding and
bfcache on), counting proxy on, 5 runs after 1 warm-up, interleaved, light
theme. The harness gained a `switch:workspaces` cell (Content to Data to
Observability to Content) and its Operations and Life cells were fixed: they
looked for navigation labels that no longer exist, so they failed on main.

The Mac was on battery, load average 5 to 7. Timings are medians and read as
an upper bound; counts, bytes and CLS do not depend on power.

| route or step (1280 unless noted)                             | before                | after                 |
| ------------------------------------------------------------- | --------------------- | --------------------- |
| Content load: FCP / interactive                               | 84 / 198 ms           | 80 / 187 ms           |
| Content load: JS transfer / decoded / requests                | 299.5 / 899.8 KB / 51 | 303.9 / 913.4 KB / 54 |
| Observability load: JS transfer / requests                    | 230.7 KB / 49         | 228.3 KB / 49         |
| Data load: JS transfer / requests                             | 242.0 KB / 52         | 234.5 KB / 50         |
| Content to Data: first change / interactive                   | 69 / 140 ms           | 73 / 164 ms           |
| Data to Observability: first change / interactive             | 77 / 144 ms           | 69 / 140 ms           |
| Observability to Content: first change / interactive          | 101 / 187 ms          | 89 / 193 ms           |
| Content to Data at 390: first change                          | 69 ms                 | 79 ms                 |
| Content to Data at 1024 (rail)                                | failed (menu in rail) | 65 ms                 |
| Writing, Pages, Projects, Newsletter in Content: first change | 69 to 85 ms           | 77 to 101 ms          |
| CLS, every load and every step, 390 / 1024 / 1280             | 0                     | 0                     |
| documents per switch                                          | 1                     | 1                     |
| cached or revalidated resources per switch                    | 0                     | 0                     |

What the numbers say:

- every page switch, inside a workspace or across one, is a new document that
  re-downloads 45 to 48 scripts and 2 to 3 stylesheets: 230 to 304 KB of JS
  transfer, 49 to 54 requests, 0 served from cache. Hashed `/_astro` assets are
  served with `Cache-Control: public, max-age=0, must-revalidate` through the
  Worker (`run_worker_first = true`), and nothing came back as a 304.
- click to first change is 65 to 101 ms on loopback. Server time is 2 to 5 ms,
  so nearly all of it is parse, hydrate and paint of a whole island per page.
- the sidebar change is cost neutral: Content pays 4.4 KB and 3 requests for
  the Data and Observability icons and the new module; Data saves 7.5 KB.
  Timing differences are inside the run-to-run spread on battery.
- CLS is 0 before and after, with a saved closed group included. Sidebar
  geometry (x, y, width, height and heading positions) is identical across
  Content, Data and Observability pages.

## options

| option                                                           | what it removes                                                                                                                                                                                           | what it costs                                                                                                                                                                                                                                                                                                                         | verdict                                                                                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| A. persistent shell, in-island client routing with `pushState`   | the document, the 49 to 54 requests and the re-hydrate for every switch the island can resolve. The approved speed design measured 42 to 52 ms click to next frame with 0 requests for in-island switches | a router, a leave guard, data resolvers per destination. Already designed and approved (`speed-design.md`, slices S1 to S19), S1 to S5 merged                                                                                                                                                                                         | pick this                                                                                                                                    |
| B. Astro `ClientRouter` with `transition:persist` on the sidebar | the JS re-download and re-parse, since the persisted island stays mounted                                                                                                                                 | still one full server render per switch, including the 18 inventory reads on Content. The sidebar lives inside the same React island as each page (AppShell wraps `children`), so persisting it means splitting the shell into its own island and passing state across islands. It also swaps `<body>` under the editor's leave guard | no. It fixes the symptom the asset cache fixes more cheaply, and fights the one-island design                                                |
| C. prefetch on hover or intent (speculation rules)               | the network wait on a hit                                                                                                                                                                                 | moves the request earlier instead of removing it; prefetched private `no-store` HTML sits in the prefetch cache past sign out unless logout sends `Clear-Site-Data: "prefetchCache", "prerenderCache"`. Safari and Firefox get nothing. Assets are not cacheable today, so an asset prefetch buys nothing                             | not now. Revisit only for the document loads A leaves (the 20 AdminLayout pages), after S8 lands the `Sec-Purpose` guard and logout clearing |
| D. streaming or skeletons                                        | perceived wait on slow reads                                                                                                                                                                              | server time is 2 to 5 ms here; the cost is client side. The approved design already specifies one skeleton per wait inside the island                                                                                                                                                                                                 | keep as part of A, not a separate step                                                                                                       |

## recommendation

Build A, in the order the speed design already set, with two changes of
emphasis that these measurements support:

1. **asset caching first (S7).** Exclude `/_astro/*` from `run_worker_first`
   and serve it `Cache-Control: private, max-age=31536000, immutable`. This is
   a config change with no router, and it takes every document switch from 45
   to 48 script downloads to 0. It is the largest measured waste and the
   cheapest fix. It touches `wrangler.toml`, so it goes in its own PR.
2. **one island for all three groups.** The unified sidebar makes the shell
   identical everywhere, so the router in S9 onward can own Data and
   Observability switches too, not only Content. Data and Observability pages
   are small reads (`/life/*` 0 to 1 ms server, Observability 0 ms), which makes
   their resolvers cheap. Content to Data and back becomes an in-island commit.
3. **keep the prepaint and the identical server markup.** They are what hold
   CLS at 0 today, and they keep direct loads and deep links honest once the
   router lands.
4. **prefetch last, and only for documents that remain.** After S8's guard and
   logout clearing, `eagerness: "moderate"` speculation rules scoped to the
   AdminLayout pages that stay documents.

## migration steps

1. S7 asset caching PR, measured with `warm:content` and `switch:workspaces`:
   expect cached resources per switch to go from 0 to about 45.
2. Move `UnifiedNavigation` onto Astryx `LinkProvider` so sidebar links can be
   intercepted by the router without changing their markup.
3. S9 onward: in-island routing for Content groups and records, then add Data
   and Observability resolvers (each page's props become a JSON read), with the
   S15 leave guard ahead of any record switch.
4. After the router covers a group, drop that group's document path from the
   harness red rows; keep `switch:workspaces` as the acceptance cell for the
   cross-workspace case.

## open questions for Ani

- the remaining operational pages (`/work`, `/fleet`, `/proof`, `/deploys`,
  `/repos`, `/handoffs`, `/system`, `/mutations`, `/knowledge`) and Content
  review pages were not in the old sidebars and are not in this one; they stay
  reachable from search. Should Observability list them?
- the sidebar tint is now the same in every workspace. The accent still changes
  per workspace. Revert the tint if the color cue mattered.
- all groups start open. With Content open on a phone the drawer scrolls; an
  alternative is to open only the active group by default.

## rerun

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
pnpm build:admin:owner   # per build under test, served on loopback
node scripts/admin/perf-measure.mjs .local/perf/after.json \
  --base http://127.0.0.1:<port> --runs 5 --warmup 1 --interleave \
  --widths 390,1024,1280 --themes light --browser-modes browser-defaults \
  --proxy --cells load:content,load:operations,load:life,switch:content-nav,switch:operations,switch:life,switch:workspaces
```
