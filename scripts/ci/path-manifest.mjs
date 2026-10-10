// One ordered table of the path rules that decide release behavior.
// release-policy.mjs reads it for risk, CI flags and deploy targets,
// security-review.mjs for the files Security Review scans, and
// check-changed-scope.mjs for the local changes that escalate to pnpm
// validate. It holds pure data and pure functions and reads no files at
// import, because check-changed-scope.mjs also runs in fixture repositories.
//
// Every row has an id, a kind and one path matcher: prefix, exact (a list of
// whole paths), suffix or pattern. A risk or removed-migration row may also
// carry a status pattern for the change line's git status. Rows of a kind
// combine as follows, in table order:
//   ignored            the first matching row decides whether a path is
//                      release-ignored: no risk, no deploy target, and a
//                      change of only ignored paths is docs_only
//   risk               the first matching row decides. approval rows come
//                      first, then the route contract row, then known-safe
//                      rows. a path no row matches is unclassified (unknown)
//   removed-migration  a deleted migration file needs approval
//   flag               any matching row sets its output, docs included
//   target             any matching row selects its deploy targets, for
//                      paths that are not release-ignored
//   sensitive          the first matching row decides whether Security
//                      Review scans the file
//   broad              any matching row makes check:changed run validate
//
// scripts/ci/path-manifest.test.mjs replays a golden corpus against these
// rules; a deliberate rule change regenerates it with --write.

const ignored = (id, matcher, value) => ({
  id,
  kind: "ignored",
  ...matcher,
  ignored: value,
});
const approval = (id, pattern, extra = {}) => ({
  id,
  kind: "risk",
  risk: "approval",
  reason: "protected surface",
  pattern,
  ...extra,
});
const safe = (id, pattern) => ({ id, kind: "risk", risk: "safe", pattern });
const flag = (name) => (id, pattern) => ({
  id,
  kind: "flag",
  flag: name,
  pattern,
});
const preflight = flag("migration_preflight_required");
const ciPolicy = flag("ci_policy_changed");
const publicBrowser = flag("public_browser_changed");
const localDev = flag("local_dev_changed");
const target = (id, matcher, ...targets) => ({
  id,
  kind: "target",
  ...matcher,
  targets,
});
const sensitive = (id, matcher, value = true) => ({
  id,
  kind: "sensitive",
  ...matcher,
  sensitive: value,
});
const broad = (id, matcher, extra = {}) => ({
  id,
  kind: "broad",
  ...matcher,
  ...extra,
});

export const PATH_RULES = Object.freeze(
  [
    // Release-ignored paths. Canonical public Markdown still deploys.
    ignored("ignored.public-content", { prefix: "content/public/" }, false),
    ignored("ignored.markdown", { suffix: ".md" }, true),
    ignored("ignored.docs", { prefix: "docs/" }, true),
    ignored(
      "ignored.issue-templates",
      { prefix: ".github/ISSUE_TEMPLATE/" },
      true,
    ),
    ignored("ignored.license", { exact: ["LICENSE"] }, true),

    // Approval: protected release surfaces.
    approval("approval.publisher-pem", /^\.github\/editorial-publisher\.pem$/),
    approval("approval.workflows", /^\.github\/workflows\//),
    approval("approval.admin-solid", /^apps\/admin-solid\//),
    approval("approval.release-train", /^config\/release-train\.json$/),
    approval(
      "approval.migration-manifest",
      /^drizzle\/migrations\/manifest\.json$/,
    ),
    approval(
      "approval.release-scripts",
      /^scripts\/ci\/(?:branch-protection|d1-migration-conditions|d1-schema-fingerprint|migration-local-proof|migration-policy|path-manifest|release-policy|release-smoke|worker-version)\.mjs$/,
    ),
    approval("approval.admin-middleware", /^apps\/admin\/src\/middleware\.ts$/),
    approval(
      "approval.access-identity",
      /^apps\/admin\/src\/lib\/access-identity\.ts$/,
    ),
    approval("approval.auth-pages", /^apps\/admin\/src\/pages\/auth\//),
    approval(
      "approval.worker-config",
      /(?:^|\/)(?:wrangler\.(?:toml|jsonc)|_routes\.json)$/,
    ),
    approval(
      "approval.credential-names",
      /(?:^|\/)(?:credentials?|secrets?)(?:\.|\/)/i,
    ),
    approval(
      "approval.workers",
      /^workers\/(?:ingest|newsletter|state|weekly-email)\//,
    ),
    // Environment template beside local secrets; classified by name only.
    approval("approval.env-template", /^\.env\.example$/),
    // Lists the ignored secret files copied into new agent worktrees, so a
    // change alters what agents receive. It holds path patterns, not values,
    // so owner review is the control; security-review's literal-secret scan
    // is not.
    approval("approval.worktree-include", /^\.worktreeinclude$/),
    // Adding, deleting or renaming a page changes the route contract.
    approval("approval.route-contract", /^apps\/(?:admin|www)\/src\/pages\//, {
      reason: "route contract changed",
      status: /^[ADR]/,
    }),

    // Known safe: classified paths that need no approval.
    safe("safe.codex-config", /^\.codex\/config\.toml$/),
    safe("safe.claude-settings", /^\.claude\/settings\.json$/),
    safe("safe.claude-launch", /^\.claude\/launch\.json$/),
    safe(
      "safe.codex-environment",
      /^\.codex\/environments\/environment\.toml$/,
    ),
    safe("safe.ignore-files", /^\.(?:gitignore|prettierignore)$/),
    safe("safe.astryx-patch", /^patches\/@astryxdesign__core@0\.4\.6\.patch$/),
    safe("safe.coderabbit", /^\.coderabbit\.yaml$/),
    safe("safe.e2e-configs", /^e2e\.(?:admin|www)\.config\.ts$/),
    safe("safe.knip", /^knip\.jsonc$/),
    safe("safe.admin-app", /^apps\/admin\//),
    safe("safe.www-app", /^apps\/www\//),
    safe("safe.packages", /^packages\//),
    safe("safe.public-content", /^content\/public\//),
    safe("safe.publication", /^content\/publication\.json$/),
    safe("safe.public-content-seed", /^drizzle\/seeds\/public-content\.json$/),
    safe("safe.scripts", /^scripts\//),
    safe("safe.config", /^config\//),
    safe("safe.migrations", /^drizzle\/migrations\//),
    safe("safe.github-meta", /^\.github\/(?:ISSUE_TEMPLATE|CODEOWNERS)/),
    safe(
      "safe.root-manifests",
      /^(?:\.nvmrc|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json)$/,
    ),
    // Editor, formatter, install and launcher settings with no deploy output.
    safe(
      "safe.editor-settings",
      /^\.(?:editorconfig|npmrc|posthog-events\.json|prettierrc)$/,
    ),
    safe("safe.dependabot", /^\.github\/dependabot\.yml$/),
    safe("safe.husky", /^\.husky\/pre-commit$/),
    safe("safe.vscode", /^\.vscode\/(?:extensions|settings)\.json$/),
    safe(
      "safe.root-tooling",
      /^(?:drizzle\.config\.ts|solo\.yml|tsconfig\.json)$/,
    ),
    // Historical drizzle-kit journal; migrations/manifest.json is the authority.
    safe("safe.drizzle-journal", /^drizzle\/meta\/_journal\.json$/),

    // Deleting a migration file is never automatic.
    {
      id: "migration.removed",
      kind: "removed-migration",
      status: /^D/,
      pattern: /^drizzle\/migrations\/\d{4}_.+\.sql$/,
    },

    // migration_preflight_required
    preflight(
      "preflight.content-publication",
      /^apps\/admin\/migrations\/content-publication\//,
    ),
    preflight(
      "preflight.publication-contract",
      /^packages\/content\/src\/editorial\/(?:direct-publication|publication-contract)(?:\.test)?\.ts$/,
    ),
    preflight(
      "preflight.content-publication-scripts",
      /^scripts\/ci\/content-publication-/,
    ),
    preflight("preflight.migrations", /^drizzle\/migrations\//),
    preflight("preflight.drizzle-meta", /^drizzle\/meta\//),
    preflight("preflight.drizzle-readme", /^drizzle\/README\.md$/),
    preflight("preflight.admin-wrangler", /^apps\/admin\/wrangler\.toml$/),
    preflight(
      "preflight.migration-scripts",
      /^scripts\/ci\/(?:d1-|migration-|site-migrations)/,
    ),

    // ci_policy_changed
    // These documents are inputs to the guidance invariants in test:workspace.
    ciPolicy("ci.guidance", /^(?:AGENTS|CLAUDE|README)\.md$/),
    ciPolicy(
      "ci.guidance-docs",
      /^docs\/(?:platform-architecture\.md|design\/admin-workspace\/quiet-precision-delivery\.md)$/,
    ),
    ciPolicy("ci.ignore-files", /^\.(?:gitignore|prettierignore)$/),
    ciPolicy(
      "ci.astryx-patch",
      /^patches\/@astryxdesign__core@0\.4\.6\.patch$/,
    ),
    ciPolicy("ci.publisher-pem", /^\.github\/editorial-publisher\.pem$/),
    ciPolicy("ci.coderabbit", /^\.coderabbit\.yaml$/),
    ciPolicy("ci.e2e-configs", /^e2e\.(?:admin|www)\.config\.ts$/),
    ciPolicy("ci.knip", /^knip\.jsonc$/),
    ciPolicy("ci.workflows", /^\.github\/workflows\//),
    ciPolicy("ci.config", /^config\//),
    ciPolicy("ci.scripts", /^scripts\/ci\//),
    ciPolicy(
      "ci.root-manifests",
      /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json)$/,
    ),
    // Turbo global dependencies and pnpm install settings change every package.
    ciPolicy("ci.global-settings", /^(?:\.npmrc|\.prettierrc|tsconfig\.json)$/),

    // public_browser_changed
    publicBrowser("browser.e2e-config", /^e2e\.www\.config\.ts$/),
    publicBrowser(
      "browser.e2e-harness",
      /^scripts\/ci\/public-e2e-(?:server|migrations)\.mjs$/,
    ),
    publicBrowser("browser.e2e-tests", /^apps\/www\/test\/e2e\//),
    publicBrowser("browser.editorial", /^packages\/content\/src\/editorial\//),
    publicBrowser(
      "browser.content-publication",
      /^apps\/admin\/migrations\/content-publication\//,
    ),
    publicBrowser(
      "browser.content-seed",
      /^scripts\/content\/(?:seed-content-d1|content-d1-seed)\.mjs$/,
    ),
    publicBrowser(
      "browser.root-manifests",
      /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/,
    ),
    // pnpm settings live in either pnpm-workspace.yaml or .npmrc.
    publicBrowser("browser.npmrc", /^\.npmrc$/),

    // local_dev_changed
    localDev("local.claude-launch", /^\.claude\/launch\.json$/),
    localDev("local.codex", /^\.codex\//),
    localDev("local.claude-settings", /^\.claude\/settings\.json$/),
    localDev("local.nvmrc", /^\.nvmrc$/),
    localDev("local.docs", /^docs\/local-development\.md$/),
    localDev("local.scripts", /^scripts\/(?:codex-action$|dev\/)/),

    // Deploy targets. Shared Astro integrations run inside both app builds.
    target("target.astro-config", { prefix: "config/astro/" }, "www", "admin"),
    target("target.www-app", { prefix: "apps/www/" }, "www"),
    target(
      "target.www-shared-modules",
      {
        pattern: /^apps\/www\/src\/(?:components|layouts|styles|lib|scripts)\//,
      },
      "admin",
    ),
    target(
      "target.public-content",
      { prefix: "content/public/" },
      "www",
      "admin",
    ),
    target(
      "target.public-content-package",
      { prefix: "packages/content/src/public/" },
      "www",
    ),
    target(
      "target.content-package-entry",
      {
        exact: [
          "packages/content/package.json",
          "packages/content/src/index.ts",
        ],
      },
      "www",
    ),
    target("target.brand", { prefix: "packages/brand/" }, "www", "admin"),
    target(
      "target.astryx-patch",
      { exact: ["patches/@astryxdesign__core@0.4.6.patch"] },
      "admin",
    ),
    target("target.admin-app", { prefix: "apps/admin/" }, "admin"),
    target("target.content-package", { prefix: "packages/content/" }, "admin"),
    target("target.lib", { prefix: "packages/lib/" }, "admin"),
    target("target.types", { prefix: "packages/types/" }, "admin", "state"),
    target("target.ingest", { prefix: "workers/ingest/" }, "ingest"),
    target(
      "target.newsletter",
      { prefix: "workers/newsletter/" },
      "newsletter",
    ),
    target("target.state", { prefix: "workers/state/" }, "state"),
    target(
      "target.weekly-email",
      { prefix: "workers/weekly-email/" },
      "weekly_email",
    ),

    // Security Review scans these files. Markdown is never scanned.
    sensitive("sensitive.markdown", { suffix: ".md" }, false),
    sensitive("sensitive.dependency-roots", {
      exact: [
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "turbo.json",
      ],
    }),
    sensitive("sensitive.release-files", {
      exact: [
        "apps/admin/src/middleware.ts",
        "apps/admin/wrangler.toml",
        "apps/www/wrangler.toml",
      ],
    }),
    sensitive("sensitive.workflows", { prefix: ".github/workflows/" }),
    sensitive("sensitive.admin-api", { prefix: "apps/admin/src/pages/api/" }),
    sensitive("sensitive.auth-pages", { prefix: "apps/admin/src/pages/auth/" }),
    sensitive("sensitive.admin-editorial", {
      prefix: "apps/admin/src/editorial/",
    }),
    sensitive("sensitive.admin-lib", { prefix: "apps/admin/src/lib/" }),
    sensitive("sensitive.admin-data", { prefix: "apps/admin/src/data/" }),
    sensitive("sensitive.patches", { prefix: "patches/" }),
    sensitive("sensitive.migrations", { prefix: "drizzle/migrations/" }),
    sensitive("sensitive.content-package", { prefix: "packages/content/" }),
    sensitive("sensitive.lib", { prefix: "packages/lib/" }),
    sensitive("sensitive.scripts", { prefix: "scripts/" }),
    sensitive("sensitive.workers", { prefix: "workers/" }),

    // check:changed runs pnpm validate for these. A prefix row matches any
    // path field of a change line. Root manifests match only the last field,
    // so a rename away from package.json does not escalate.
    broad("broad.github", { prefix: ".github/" }),
    broad("broad.config", { prefix: "config/" }),
    broad("broad.scripts", { prefix: "scripts/" }),
    broad(
      "broad.root-manifests",
      {
        exact: [
          "package.json",
          "pnpm-lock.yaml",
          "pnpm-workspace.yaml",
          "turbo.json",
        ],
      },
      { lastFieldOnly: true },
    ),
    broad("broad.lib", { prefix: "packages/lib/" }),
    broad("broad.types", { prefix: "packages/types/" }),
  ].map((rule) => Object.freeze(rule)),
);

const RULES_BY_KIND = new Map();
for (const rule of PATH_RULES) {
  if (!RULES_BY_KIND.has(rule.kind)) RULES_BY_KIND.set(rule.kind, []);
  RULES_BY_KIND.get(rule.kind).push(rule);
}
for (const rules of RULES_BY_KIND.values()) Object.freeze(rules);

export function rulesOfKind(kind) {
  return RULES_BY_KIND.get(kind) ?? [];
}

export function matchesPath(rule, path) {
  if (rule.prefix !== undefined) return path.startsWith(rule.prefix);
  if (rule.exact !== undefined) return rule.exact.includes(path);
  if (rule.suffix !== undefined) return path.endsWith(rule.suffix);
  return rule.pattern.test(path);
}

function matchesChange(rule, path, status) {
  return (
    (rule.status === undefined || rule.status.test(status)) &&
    matchesPath(rule, path)
  );
}

/** The first row of a kind that matches, in table order. Without a status
 * the path is checked as a modification (M). */
export function firstRule(kind, path, status = "M") {
  return rulesOfKind(kind).find((rule) => matchesChange(rule, path, status));
}

/** Every row of a kind that matches, in table order. */
export function matchingRules(kind, path, status = "M") {
  return rulesOfKind(kind).filter((rule) => matchesChange(rule, path, status));
}

/** Whether one local change line escalates check:changed to validate. */
export function isBroadChangeLine(line) {
  const fields = line.split("\t");
  if (fields.length < 2) return false;
  return rulesOfKind("broad").some((rule) =>
    rule.lastFieldOnly
      ? matchesPath(rule, fields.at(-1))
      : fields.slice(1).some((path) => matchesPath(rule, path)),
  );
}
