import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { readJson, syncHealth } from "./review-state.mjs";

/** Development-only identity. Read the current revision, not a startup snapshot. */
export function adminPreviewIdentity(root) {
  return {
    name: "admin-preview-identity",
    enforce: "pre",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        // Astro's non-runnable dev renderer can emit filesystem-rooted script
        // URLs. Vite serves these components relative to its application root.
        const appPrefix = `${join(root, "apps", "www")}/`;
        const dependencyPrefix = `${join(root, "node_modules", ".pnpm")}/`;
        const [pathname = "", query = ""] = (request.url ?? "").split("?");
        const params = new URLSearchParams(query);
        if (
          pathname.endsWith(".astro") &&
          params.has("astro") &&
          params.get("type") === "script"
        ) {
          const target = pathname.startsWith(appPrefix)
            ? `/${pathname.slice(appPrefix.length)}?${query}`
            : pathname.startsWith(dependencyPrefix) && pathname.endsWith("/node_modules/astro/components/ClientRouter.astro")
              ? `/@fs${pathname}?${query}`
              : null;
          if (target) {
            response.statusCode = 302;
            response.setHeader("Location", target);
            response.setHeader("Cache-Control", "no-store");
            response.end();
            return;
          }
        }
        if (request.url?.split("?")[0] !== "/api/review-identity")
          return next();
        if (request.method !== "GET") return next();
        try {
          const git = (...args) =>
            execFileSync("git", args, {
              cwd: root,
              encoding: "utf8",
              stdio: ["ignore", "pipe", "ignore"],
            }).trim();
          response.setHeader("Content-Type", "application/json");
          response.setHeader("Cache-Control", "no-store");
          response.end(
            JSON.stringify({
              checkout: realpathSync(root),
              revision: git("rev-parse", "HEAD"),
              branch: git("branch", "--show-current"),
              mode: "development",
              dirty: Boolean(git("status", "--porcelain")),
              sync: (() => {
                const value = readJson(
                  join(root, ".local/published-preview/status.json"),
                );
                return { ...value, ...syncHealth(value) };
              })(),
              approvals: {
                code: "review in the integration queue",
                content: "publish in production admin",
                deployment: "approve the exact release separately",
              },
            }),
          );
        } catch {
          response.statusCode = 503;
          response.end();
        }
      });
    },
  };
}
