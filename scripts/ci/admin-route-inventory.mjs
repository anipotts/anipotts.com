export const ADMIN_ROUTES = [
  { route: "/", file: "apps/admin/src/pages/index.astro", nav: false },
  { route: "/inbox", file: "apps/admin/src/pages/inbox.astro", nav: true },
  {
    route: "/auth/passkey",
    file: "apps/admin/src/pages/auth/passkey.astro",
    nav: false,
  },
  {
    route: "/content",
    file: "apps/admin/src/pages/content/index.astro",
    nav: true,
  },
  {
    route: "/content/review",
    file: "apps/admin/src/pages/content/review.astro",
    nav: true,
  },
  {
    route: "/content/carousels",
    file: "apps/admin/src/pages/content/carousels.astro",
    nav: true,
    smoke: false,
  },
  {
    route: "/content/drafts",
    file: "apps/admin/src/pages/content/drafts.astro",
    nav: true,
  },
  {
    route: "/content/edit/home",
    file: "apps/admin/src/pages/content/edit/[pageKey].astro",
    nav: false,
  },
  {
    route: "/content/preview",
    file: "apps/admin/src/pages/content/preview.astro",
    nav: true,
  },
  {
    route: "/content/operations",
    file: "apps/admin/src/pages/content/operations.astro",
    nav: true,
  },
  {
    route: "/newsletter",
    file: "apps/admin/src/pages/newsletter.astro",
    nav: true,
  },
  {
    route: "/newsletter/first-thing-agents-need-control-plane",
    file: "apps/admin/src/pages/newsletter/[slug].astro",
    nav: false,
  },
  { route: "/proof", file: "apps/admin/src/pages/proof.astro", nav: true },
  { route: "/deploys", file: "apps/admin/src/pages/deploys.astro", nav: true },
  { route: "/repos", file: "apps/admin/src/pages/repos.astro", nav: true },
  {
    route: "/handoffs",
    file: "apps/admin/src/pages/handoffs.astro",
    nav: true,
  },
  { route: "/fleet", file: "apps/admin/src/pages/fleet.astro", nav: true },
  {
    route: "/mutations",
    file: "apps/admin/src/pages/mutations.astro",
    nav: true,
  },
  {
    route: "/ops/destructive",
    file: "apps/admin/src/pages/ops/destructive.astro",
    nav: true,
  },
  {
    route: "/api/admin/runtime-feed",
    file: "apps/admin/src/pages/api/admin/runtime-feed.ts",
    nav: false,
    smoke: false,
  },
  {
    route: "/api/admin/inbox",
    file: "apps/admin/src/pages/api/admin/inbox.ts",
    nav: false,
    smoke: false,
  },
  {
    route: "/api/admin/projections",
    file: "apps/admin/src/pages/api/admin/projections.ts",
    nav: false,
    smoke: false,
  },
  {
    route: "/api/admin/project-states",
    file: "apps/admin/src/pages/api/admin/project-states.ts",
    nav: false,
    smoke: false,
  },
  {
    route: "/api/admin/task-states",
    file: "apps/admin/src/pages/api/admin/task-states.ts",
    nav: false,
    smoke: false,
  },
  {
    route: "/api/admin/task-lineage",
    file: "apps/admin/src/pages/api/admin/task-lineage.ts",
    nav: false,
    smoke: false,
  },
  {
    route: "/api/admin/content/draft-operation",
    file: "apps/admin/src/pages/api/admin/content/draft-operation.ts",
    nav: false,
  },
  {
    route: "/api/admin/content/editor",
    file: "apps/admin/src/pages/api/admin/content/editor.ts",
    nav: false,
    smoke: false,
  },
];

export const PUBLIC_UNSMOKED_ROUTE_FILES = [
  "apps/admin/src/pages/api/health.ts",
  "apps/admin/src/pages/api/mcp.ts",
  "apps/admin/src/pages/api/admin/passkey/login-options.ts",
  "apps/admin/src/pages/api/admin/passkey/login-verify.ts",
  "apps/admin/src/pages/api/admin/passkey/logout.ts",
  "apps/admin/src/pages/api/admin/passkey/register-options.ts",
  "apps/admin/src/pages/api/admin/passkey/register-verify.ts",
  "apps/admin/src/pages/api/admin/passkey/revoke-current.ts",
  "apps/admin/src/pages/api/admin/passkey/status.ts",
];

export const ADMIN_PROTECTED_SMOKE_ROUTES = ADMIN_ROUTES.filter(
  (route) => route.smoke !== false,
).map((route) => route.route);
