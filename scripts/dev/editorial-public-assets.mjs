import { readFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, resolve, sep } from "node:path";

/** Serve public website media in the local editor without a second dev server. */
export function editorialPublicAssets() {
  const root = fileURLToPath(
    new URL("../../apps/www/public/", import.meta.url),
  );
  const types = {
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
  };
  return {
    name: "editorial-public-assets",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!["GET", "HEAD"].includes(request.method ?? "")) return next();
        try {
          const path = decodeURIComponent(
            new URL(request.url, "http://localhost").pathname,
          );
          if (!/^\/(images|media|fonts|brand)\//u.test(path)) return next();
          const file = await realpath(resolve(root, `.${path}`));
          const resolvedRoot = await realpath(root);
          const type = types[extname(file).toLowerCase()];
          if (!file.startsWith(resolvedRoot + sep) || !type) return next();
          const bytes = await readFile(file);
          response.setHeader("Content-Type", type);
          response.setHeader("Cache-Control", "no-cache");
          response.setHeader("X-Content-Type-Options", "nosniff");
          response.end(request.method === "HEAD" ? undefined : bytes);
        } catch {
          next();
        }
      });
    },
  };
}
