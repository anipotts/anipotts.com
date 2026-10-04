import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { readJson, syncHealth } from "./review-state.mjs";

/** Development-only identity. Read the current revision, not a startup snapshot. */
export function adminPreviewIdentity(root) {
  return {
    name: "admin-preview-identity",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
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
