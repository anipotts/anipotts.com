import { RETIRED_ROUTE_REDIRECTS } from "../../apps/admin/src/lib/retired-routes.mjs";

export const ADMIN_ROUTES = [
  {
    // The one overview.
    route: "/",
    file: "apps/admin/src/pages/index.astro",
    nav: false,
  },
  {
    route: "/content/pages",
    file: "apps/admin/src/pages/content/[library].astro",
    nav: true,
  },
  {
    route: "/content/writing",
    file: "apps/admin/src/pages/content/[library].astro",
    nav: true,
  },
  {
    route: "/content/projects",
    file: "apps/admin/src/pages/content/[library].astro",
    nav: true,
  },
  {
    route: "/content/newsletter",
    file: "apps/admin/src/pages/content/[library].astro",
    nav: true,
  },
  {
    route: "/data/records",
    file: "apps/admin/src/pages/data/[...path].astro",
    nav: true,
    smoke: false,
  },
  {
    // Record detail; the id shape is checked, the record is read in the browser.
    route: "/data/records/rec-00000000000000000000000000000000",
    file: "apps/admin/src/pages/data/[...path].astro",
    nav: false,
    smoke: false,
  },
  {
    route: "/data/sources",
    file: "apps/admin/src/pages/data/[...path].astro",
    nav: true,
    smoke: false,
  },
  {
    route: "/data/health",
    file: "apps/admin/src/pages/data/[...path].astro",
    nav: true,
    smoke: false,
  },
  {
    route: "/data/knowledge",
    file: "apps/admin/src/pages/data/[...path].astro",
    nav: true,
    smoke: false,
  },
  {
    route: "/observability/status",
    file: "apps/admin/src/pages/observability/[view].astro",
    nav: true,
    smoke: false,
  },
  {
    route: "/observability/activity",
    file: "apps/admin/src/pages/observability/[view].astro",
    nav: true,
    smoke: false,
  },
  {
    route: "/observability/alerts",
    file: "apps/admin/src/pages/observability/[view].astro",
    nav: true,
    smoke: false,
  },
  {
    // Retired; 308 redirects to its library route.
    route: "/content",
    file: "apps/admin/src/pages/content/index.astro",
    nav: false,
    smoke: false,
  },
  {
    // Retired; 308 redirects to /content/newsletter.
    route: "/newsletter",
    file: "apps/admin/src/pages/newsletter.astro",
    nav: false,
    smoke: false,
  },
  {
    // Retired; 308 redirects to its Data view.
    route: "/life/people",
    file: "apps/admin/src/pages/life/[section].astro",
    nav: false,
    smoke: false,
  },
  {
    // Retired; 308 redirects to /data/records.
    route: "/knowledge",
    file: "apps/admin/src/pages/knowledge.astro",
    nav: false,
    smoke: false,
  },
  {
    // Retired; 308 redirects to /data/records?kind=places.
    route: "/knowledge/locations",
    file: "apps/admin/src/pages/knowledge/locations.astro",
    nav: false,
    smoke: false,
  },
  {
    // Development only: astro.config.mjs injects it under astro dev.
    route: "/content/dev-catalog",
    file: "apps/admin/src/dev/dev-catalog.astro",
    nav: false,
    smoke: false,
  },
  {
    route: "/auth/logout",
    file: "apps/admin/src/pages/auth/logout.astro",
    nav: false,
  },
  {
    route: "/api/admin/logout",
    file: "apps/admin/src/pages/api/admin/logout.ts",
    nav: false,
  },
  {
    // Retired; 308 redirects to the record's editor.
    route: "/content/edit/home",
    file: "apps/admin/src/pages/content/edit/[pageKey].astro",
    nav: false,
    smoke: false,
  },
  {
    route: "/newsletter/first-thing-agents-need-control-plane",
    file: "apps/admin/src/pages/newsletter/[slug].astro",
    nav: false,
  },
  {
    route: "/api/admin/control-plane",
    file: "apps/admin/src/pages/api/admin/control-plane.ts",
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
    route: "/api/admin/knowledge",
    file: "apps/admin/src/pages/api/admin/knowledge.ts",
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
  {
    route: "/content/home/home",
    file: "apps/admin/src/pages/content/[collection]/[id].astro",
    nav: false,
    smoke: false,
  },
  {
    route: "/preview/home",
    file: "apps/admin/src/pages/preview/home.astro",
    nav: false,
    smoke: false,
  },
  {
    route: "/preview/record",
    file: "apps/admin/src/pages/preview/record.astro",
    nav: false,
    smoke: false,
  },
  {
    route: "/content/new",
    file: "apps/admin/src/pages/content/new.astro",
    nav: false,
    smoke: false,
  },
  {
    route: "/content/new-project",
    file: "apps/admin/src/pages/content/new-project.astro",
    nav: false,
    smoke: false,
  },
  {
    route: "/api/editorial/media",
    file: "apps/admin/src/pages/api/editorial/media.ts",
    nav: false,
    smoke: false,
  },
  {
    route: "/api/editorial/record",
    file: "apps/admin/src/pages/api/editorial/[action].ts",
    nav: false,
    smoke: false,
  },
  {
    route: "/api/private-reader/credential",
    file: "apps/admin/src/pages/api/private-reader/[mode].ts",
    nav: false,
    smoke: false,
  },
  {
    route: "/api/private-reader/ops-credential",
    file: "apps/admin/src/pages/api/private-reader/[mode].ts",
    nav: false,
    smoke: false,
  },
  {
    // Unknown paths and rejected route params render here, inside the shell.
    route: "/404",
    file: "apps/admin/src/pages/404.astro",
    nav: false,
    smoke: false,
  },
];

// Retired URLs with no page file. The retiredRoutes() integration in
// apps/admin/astro.config.mjs answers each with a 308 to its live
// destination, behind the same middleware.
export const ADMIN_REDIRECTS = RETIRED_ROUTE_REDIRECTS;

export const PUBLIC_UNSMOKED_ROUTE_FILES = [
  "apps/admin/src/pages/auth.astro",
  "apps/admin/src/pages/api/health.ts",
  "apps/admin/src/pages/api/mcp.ts",
];

export const RETIRED_ADMIN_AUTH_FILES = [
  "apps/admin/src/pages/api/admin/auth/session.ts",
  "apps/admin/src/pages/api/admin/device/approve.ts",
  "apps/admin/src/pages/api/admin/device/claim.ts",
  "apps/admin/src/pages/api/admin/device/review.ts",
  "apps/admin/src/pages/api/admin/device/start.ts",
  "apps/admin/src/pages/api/admin/device/status.ts",
  "apps/admin/src/pages/api/admin/invites/register-options.ts",
  "apps/admin/src/pages/api/admin/invites/register-verify.ts",
  "apps/admin/src/pages/api/admin/invites/status.ts",
  "apps/admin/src/pages/api/admin/machine-tokens/create.ts",
  "apps/admin/src/pages/api/admin/machine-tokens/revoke.ts",
  "apps/admin/src/pages/api/admin/machine-tokens/rotate.ts",
  "apps/admin/src/pages/api/admin/members/approve.ts",
  "apps/admin/src/pages/api/admin/members/invite.ts",
  "apps/admin/src/pages/api/admin/passkey/login-options.ts",
  "apps/admin/src/pages/api/admin/passkey/login-verify.ts",
  "apps/admin/src/pages/api/admin/passkey/logout.ts",
  "apps/admin/src/pages/api/admin/passkey/register-options.ts",
  "apps/admin/src/pages/api/admin/passkey/register-verify.ts",
  "apps/admin/src/pages/api/admin/passkey/revoke-current.ts",
  "apps/admin/src/pages/api/admin/passkey/status.ts",
  "apps/admin/src/pages/api/admin/password/login.ts",
  "apps/admin/src/pages/api/admin/password/logout.ts",
  "apps/admin/src/pages/api/admin/password/status.ts",
  "apps/admin/src/pages/api/admin/recovery/google/bootstrap.ts",
  "apps/admin/src/pages/api/admin/recovery/google/callback.ts",
  "apps/admin/src/pages/api/admin/recovery/google/start.ts",
  "apps/admin/src/pages/api/admin/recovery/passkey/options.ts",
  "apps/admin/src/pages/api/admin/recovery/passkey/verify.ts",
  "apps/admin/src/pages/auth/device/[requestId].astro",
  "apps/admin/src/pages/auth/invite.astro",
  "apps/admin/src/pages/auth/passkey.ts",
  "apps/admin/src/pages/auth/recover.astro",
  "apps/admin/src/pages/auth/recover/passkey.astro",
];

export const ADMIN_PROTECTED_SMOKE_ROUTES = ADMIN_ROUTES.filter(
  (route) => route.smoke !== false,
).map((route) => route.route);
