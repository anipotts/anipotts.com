// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import icon from "astro-icon";
import astroAdvisoryGuard from "../../config/astro/advisory-guard.mjs";
import { publicContentHotReload } from "../../scripts/dev/public-content-hot-reload.mjs";
import { editorialPublicAssets } from "../../scripts/dev/editorial-public-assets.mjs";
import { editorialUpdates } from "../../scripts/dev/editorial-updates.mjs";
import { localOwnerLoopbackGuard } from "../../scripts/dev/admin-local-owner-host.mjs";

// Local owner is a build-time development identity. The shell environment
// decides it once here; Worker bindings, wrangler vars and requests cannot.
const adminLocalOwnerFlag = process.env.ADMIN_LOCAL_OWNER;
if (![undefined, "", "1"].includes(adminLocalOwnerFlag)) {
  throw new Error("ADMIN_LOCAL_OWNER must be 1 or unset");
}
const adminLocalOwner = adminLocalOwnerFlag === "1";
if (adminLocalOwner && process.env.GITHUB_ACTIONS === "true") {
  throw new Error(
    "ADMIN_LOCAL_OWNER is local-only and must not be set in GitHub Actions",
  );
}

export default defineConfig({
  site: "https://admin.anipotts.com",
  output: "server",
  // A local owner build never writes the directory wrangler deploys.
  ...(adminLocalOwner ? { outDir: "./.local/local-owner-dist" } : {}),
  trailingSlash: "never",
  // One coherent React island per editorial page; Astro retains server routing.
  integrations: [
    astroAdvisoryGuard(),
    react(),
    icon({ include: { ph: ["*"] } }),
    // Last, so it checks the host every other integration left behind.
    localOwnerLoopbackGuard({ enabled: adminLocalOwner }),
  ],
  server: {
    host: "127.0.0.1",
    port: 3001,
  },
  vite: {
    // Explicit loopback-only editor development. Production compilation ignores it.
    define: {
      "import.meta.env.EDITORIAL_LOCAL_PREVIEW": "true",
      // Not import.meta.env: Astro rewrites a private env name there into a
      // runtime process.env read, which Workers fill from wrangler vars.
      __LOCAL_OWNER_BUILD__: JSON.stringify(adminLocalOwner),
    },
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
      editorialPublicAssets(),
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
