// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import icon from "astro-icon";
import { publicContentHotReload } from "../../scripts/dev/public-content-hot-reload.mjs";
import { editorialUpdates } from "../../scripts/dev/editorial-updates.mjs";

export default defineConfig({
  site: "https://admin.anipotts.com",
  output: "server",
  trailingSlash: "never",
  // One coherent React island per editorial page; Astro retains server routing.
  integrations: [react(), icon({ include: { ph: ["*"] } })],
  server: {
    host: "127.0.0.1",
    port: 3001,
  },
  vite: {
    // Explicit loopback-only editor development. Production compilation ignores it.
    define: { "import.meta.env.EDITORIAL_LOCAL_PREVIEW": "true" },
    plugins: [
      {
        name: "admin-preview-cache",
        apply: "serve",
        config() {
          // Builds and checks must not invalidate the running editor's imports.
          return { cacheDir: "node_modules/.vite/editorial-preview" };
        },
      },
      publicContentHotReload(),
      editorialUpdates(),
      {
        name: "exclude-local-editor-runtime",
        apply: "build",
        enforce: "pre",
        resolveId(id) {
          if (id.endsWith("/editorial-local"))
            return "\0editorial-local-disabled";
        },
        load(id) {
          if (id === "\0editorial-local-disabled")
            return "export function localDraftStorage(){throw new Error('local_only')} export function localHomeBase(){throw new Error('local_only')}";
        },
      },
    ],
    server: {
      allowedHosts: [".admin.anipotts.localhost"],
    },
  },
  adapter: cloudflare({
    workerEntryPoint: {
      path: "./src/worker.ts",
      namedExports: ["EditorialDraftStore"],
    },
    platformProxy: { enabled: true },
    imageService: "passthrough",
  }),
});
