// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { unified } from "@astrojs/markdown-remark";
import { publishedHeadingIds } from "../www/src/lib/published-heading-ids.mjs";
import icon from "astro-icon";
import astroAdvisoryGuard from "../../config/astro/advisory-guard.mjs";
import { publicContentHotReload } from "../../scripts/dev/public-content-hot-reload.mjs";
import { editorialPublicAssets } from "../../scripts/dev/editorial-public-assets.mjs";
import { editorialUpdates } from "../../scripts/dev/editorial-updates.mjs";
import { localOwnerLoopbackGuard } from "../../scripts/dev/admin-local-owner-host.mjs";
import { retiredRoutes } from "./src/lib/retired-routes.mjs";

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
  // Auth uses Access and application cookies, never Astro sessions. Without
  // this the adapter provisions a SESSION KV binding the Worker never had.
  session: false,
  // Astro 7 defaults to JSX whitespace rules. Keep the lossless HTML
  // compression the admin has always shipped.
  compressHTML: true,
  // Astro 7 defaults to Sätteri. Keep the remark/rehype pipeline.
  markdown: { processor: unified({ rehypePlugins: [publishedHeadingIds] }) },
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
    // Retired URLs answer 308 through the middleware, like any other route.
    retiredRoutes(),
    // The component catalog exists only under astro dev. A build never
    // compiles it or its fixtures.
    {
      name: "admin-dev-catalog",
      hooks: {
        "astro:config:setup": ({ command, injectRoute }) => {
          if (command === "dev")
            injectRoute({
              pattern: "/content/dev-catalog",
              entrypoint: "./src/dev/dev-catalog.astro",
            });
        },
      },
    },
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
        // astro dev renders in workerd, whose console.createTask throws "not
        // implemented". React's development build calls it while its modules
        // load, so the dev server renders without it. Builds are unaffected.
        name: "admin-dev-workerd-console",
        apply: "serve",
        configEnvironment(name) {
          if (name === "ssr")
            return { define: { "console.createTask": "undefined" } };
        },
      },
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
        name: "editorial-build-boundaries",
        apply: "build",
        enforce: "pre",
        resolveId(id) {
          // Public components are reused inside private preview frames. Their
          // navigation affordances must not prefetch owner-only admin routes.
          if (id === "astro:prefetch") return "\0editorial-preview-prefetch";
        },
        load(id) {
          if (id === "\0editorial-preview-prefetch")
            return "export function prefetch() {}";
        },
      },
    ],
  },
  // The Worker entry, with the EditorialDraftStore export, is `main` in
  // wrangler.toml (src/worker.ts).
  adapter: cloudflare({
    imageService: "passthrough",
    // astro dev runs the Worker with local-only bindings: its own EDITORIAL
    // Durable Object, local D1 and local R2 under .wrangler/state. Remote
    // bindings stay off even if a binding is ever marked `remote`.
    remoteBindings: false,
  }),
});
