import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const virtualId = "virtual:editorial-updates";
const resolvedId = `\0${virtualId}`;

export function parseContentHistory(log) {
  const updates = {};
  let timestamp = null;
  for (const line of log.split("\n")) {
    if (line.startsWith("updated:")) timestamp = line.slice(8);
    else if (
      timestamp &&
      /^content\/(public|editorial)\/.+\.md$/.test(line) &&
      !updates[line]
    ) {
      updates[line] = { at: timestamp, source: "git" };
    }
  }
  return updates;
}

/** Build-time metadata only: no Git executable or filesystem in the deployed worker. */
export function editorialUpdates() {
  let local = false;
  return {
    name: "editorial-updates",
    configResolved(config) {
      local = config.command === "serve";
    },
    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },
    handleHotUpdate(context) {
      if (!/\/content\/(public|editorial)\/.+\.md$/.test(context.file)) return;
      const metadata = context.server.moduleGraph.getModuleById(resolvedId);
      if (metadata) {
        context.server.moduleGraph.invalidateModule(metadata);
        return [...context.modules, metadata];
      }
    },
    load(id) {
      if (id !== resolvedId) return;
      const git = (args) =>
        execFileSync("git", args, {
          cwd: root,
          encoding: "utf8",
          maxBuffer: 8 * 1024 * 1024,
        });
      const updates = parseContentHistory(
        git([
          "log",
          "--format=updated:%cI",
          "--name-only",
          "--",
          "content/public",
          "content/editorial",
        ]),
      );
      if (local) {
        const paths = new Set([
          ...git([
            "diff",
            "--name-only",
            "-z",
            "HEAD",
            "--",
            "content/public",
            "content/editorial",
          ]).split("\0"),
          ...git([
            "ls-files",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
            "content/public",
            "content/editorial",
          ]).split("\0"),
        ]);
        for (const path of paths) {
          if (!path.endsWith(".md")) continue;
          try {
            updates[path] = {
              at: statSync(
                new URL(path, new URL("../../", import.meta.url)),
              ).mtime.toISOString(),
              source: "local",
            };
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
        }
      }
      return `export default ${JSON.stringify(updates)};`;
    },
  };
}
