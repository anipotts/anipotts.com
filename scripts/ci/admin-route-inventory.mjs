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
    file: "apps/admin/src/pages/data/records/index.astro",
    nav: true,
    smoke: false,
  },
  {
    // Record detail; the id shape is checked, the record is read in the browser.
    route: "/data/records/rec-00000000000000000000000000000000",
    file: "apps/admin/src/pages/data/records/[id].astro",
    nav: false,
    smoke: false,
  },
  {
    route: "/data/sources",
    file: "apps/admin/src/pages/data/sources.astro",
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
    // 308 redirects to /data/records.
    route: "/data",
    file: "apps/admin/src/pages/data/index.astro",
    nav: false,
    smoke: false,
  },
  {
    // Retired; 308 redirects to /data/records.
    route: "/life",
    file: "apps/admin/src/pages/life/index.astro",
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
    // Retired; 308 redirects to /observability/status.
    route: "/operations/observability",
    file: "apps/admin/src/pages/operations/observability.astro",
    nav: false,
    smoke: false,
  },
  {
    // Retired; 308 redirects to /observability/status.
    route: "/inbox",
    file: "apps/admin/src/pages/inbox.astro",
    nav: false,
    smoke: false,
  },
  {
    route: "/content/dev-catalog",
    file: "apps/admin/src/pages/content/dev-catalog.astro",
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
    route: "/work",
    file: "apps/admin/src/pages/work.astro",
    nav: true,
    smoke: false,
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
    route: "/newsletter/first-thing-agents-need-control-plane",
    file: "apps/admin/src/pages/newsletter/[slug].astro",
    nav: false,
  },
  {
    route: "/proof",
    file: "apps/admin/src/pages/proof.astro",
    nav: true,
  },
  {
    // Retired; 308 redirects to the Proof log.
    route: "/deploys",
    file: "apps/admin/src/pages/deploys.astro",
    nav: false,
    smoke: false,
  },
  {
    // Retired; 308 redirects to Observability Status.
    route: "/repos",
    file: "apps/admin/src/pages/repos.astro",
    nav: false,
    smoke: false,
  },
  {
    // Retired; 308 redirects to Work history.
    route: "/handoffs",
    file: "apps/admin/src/pages/handoffs.astro",
    nav: false,
    smoke: false,
  },
  {
    // Retired; 308 redirects to Observability Status.
    route: "/fleet",
    file: "apps/admin/src/pages/fleet.astro",
    nav: false,
    smoke: false,
  },
  {
    route: "/system",
    file: "apps/admin/src/pages/system.astro",
    nav: true,
    smoke: false,
  },
  {
    // Retired; 308 redirects to Gates.
    route: "/mutations",
    file: "apps/admin/src/pages/mutations.astro",
    nav: false,
    smoke: false,
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
    file: "apps/admin/src/pages/api/private-reader/credential.ts",
    nav: false,
    smoke: false,
  },
  {
    route: "/api/private-reader/ops-credential",
    file: "apps/admin/src/pages/api/private-reader/ops-credential.ts",
    nav: false,
    smoke: false,
  },
];

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
