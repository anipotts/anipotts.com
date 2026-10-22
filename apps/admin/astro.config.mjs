// @ts-check
import { adminDependencyDiscovery } from "../../scripts/dev/admin-dependency-discovery.mjs";
import { fileURLToPath } from "node:url";
import { adminPreviewIdentity } from "../../scripts/dev/admin-preview-identity.mjs";
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { openaiScope } from "./src/styles/openai-scope.mjs";
import { unified } from "@astrojs/markdown-remark";
import { publishedHeadingIds } from "../www/src/lib/published-heading-ids.mjs";
import icon from "astro-icon";
import { previewIcons } from "./src/lib/preview-icons.mjs";
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
const isolatedOwnerTest =
  adminLocalOwner && Boolean(process.env.ADMIN_E2E_STATE_DIR);
if (adminLocalOwner && process.env.GITHUB_ACTIONS === "true") {
  throw new Error(
    "ADMIN_LOCAL_OWNER is local-only and must not be set in GitHub Actions",
  );
}

/** Only public preview code/assets need opaque-frame CORS in disposable tests.
 * Vite still serves the request and enforces its own filesystem restrictions. */
/** @returns {Extract<NonNullable<import("astro").ViteUserConfig["plugins"]>[number], { name: string }>} */
function isolatedPreviewAssets() {
  const root = fileURLToPath(new URL("../..", import.meta.url)).replace(
    /\/$/,
    "",
  );
  return {
    name: "isolated-owner-preview-assets",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (
          !["GET", "HEAD"].includes(request.method ?? "") ||
          request.headers.origin !== "null" ||
          request.headers.forwarded ||
          request.headers["x-forwarded-host"]
        )
          return next();
        let url;
        try {
          url = new URL(request.url ?? "", `http://${request.headers.host}`);
          if (
            url.protocol !== "http:" ||
            url.username ||
            url.password ||
            url.hash ||
            !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
            url.host !== request.headers.host
          )
            return next();
        } catch {
          return next();
        }
        let path;
        try {
          path = decodeURIComponent(url.pathname);
        } catch {
          return next();
        }
        const queries = [...url.searchParams.keys()];
        if (
          queries.some(
            (key) =>
              ![
                "astro",
                "type",
                "index",
                "v",
                "t",
                "import",
                "url",
                "lang.css",
                "lang.ts",
                "lang.js",
              ].includes(key),
          )
        )
          return next();
        const file = path.startsWith("/@fs/") ? path.slice(4) : path;
        const publicSource = [
          `${root}/apps/www/src/components/`,
          `${root}/apps/www/src/layouts/`,
          `${root}/apps/www/src/styles/`,
        ].some((prefix) => file.startsWith(prefix));
        // Raw Astro documents never qualify, only their generated script/style.
        const module =
          (publicSource ||
            file === `${root}/packages/brand/src/BrandMark.astro`) &&
          (/\.(?:css|ts|js|mjs)$/.test(file) ||
            (file.endsWith(".astro") &&
              url.searchParams.has("astro") &&
              ["script", "style"].includes(
                url.searchParams.get("type") ?? "",
              )));
        const clientModule = [
          `${root}/apps/www/src/scripts/pointer-modality.ts`,
          `${root}/apps/www/src/lib/shared-currents.ts`,
          `${root}/apps/www/src/lib/current-tuner.ts`,
          `${root}/packages/brand/src/theme.ts`,
        ].includes(file);
        const font =
          /\.woff2?$/.test(file) &&
          (file.startsWith(
            `${root}/packages/brand/ap-structural-v0.2.0-candidate.1/fonts/`,
          ) ||
            new RegExp(
              `^${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/node_modules/\\.pnpm/@fontsource-variable\\+(?:instrument-sans|jetbrains-mono)@[^/]+/node_modules/@fontsource-variable/(?:instrument-sans|jetbrains-mono)/files/[^/]+\\.woff2?$`,
            ).test(file));
        const viteModule =
          path === "/@vite/client" ||
          /^\/node_modules\/\.vite\/editorial-preview\/deps\/[^/]+\.(?:js|css)$/.test(
            path,
          );
        if (
          !(module || clientModule || font || viteModule) ||
          file.split("/").includes("..") ||
          file.includes("\\")
        )
          return next();
        response.setHeader("Access-Control-Allow-Origin", "null");
        const vary = response.getHeader("Vary");
        const values = (
          Array.isArray(vary) ? vary.join(",") : String(vary ?? "")
        )
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        if (!values.some((value) => value.toLowerCase() === "origin"))
          values.push("Origin");
        response.setHeader("Vary", values.join(", "));
        next();
      });
    },
  };
}

export default defineConfig({
  // The disposable owner test server does not exercise Astro developer tools.
  // Ordinary development and the durable owner preview retain their toolbar.
  devToolbar: {
    enabled: !isolatedOwnerTest,
  },
  // Auth uses Access and application cookies, never Astro sessions. Without
  // this the adapter provisions a SESSION KV binding the Worker never had.
  session: false,
  // Astro 7 defaults to JSX whitespace rules. Keep the lossless HTML
  // compression the admin has always shipped.
  compressHTML: true,
  // Astro hashes the scripts it emits during a production render, including
  // its React-island hydration code. Inline editor styles remain necessary.
  security: {
    csp: {
      scriptDirective: {
        resources: ["'self'"],
        // React DOM 19.2.8's fixed streaming bootstrap scripts. The built
        // response test rejects any new or changed inline script on editor pages.
        hashes: [
          "sha256-7mu4H06fwDCjmnxxr/xNHyuQC6pLTHr4M2E4jXw5WZs=",
          "sha256-yi012Kn9/HuLERn0KDX7eURMXowcJeid3ivxwiNughw=",
        ],
      },
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
      directives: ["object-src 'none'", "base-uri 'none'"],
    },
  },
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
    icon({ include: previewIcons }),
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
    // The dependency scanner must start from app views, never unit-test files
    // that import Node-only Astro/Wrangler/Tailwind configuration.
    optimizeDeps: adminDependencyDiscovery.client,
    // Cloudflare supplies a separate SSR discovery set. Vite does not inherit
    // entries from the client environment, so exclude tests in both scans.
    environments: {
      ssr: {
        optimizeDeps: adminDependencyDiscovery.ssr,
      },
    },
    // Keep Worker stack-trace mappings without embedding development-only
    // authoring source (including local-owner branches) in deployable maps.
    build: {
      rolldownOptions: { output: { sourcemapExcludeSources: true } },
    },
    // SDK foundations are scoped after Tailwind expands their imports. Legacy
    // Astryx surfaces never receive the SDK reset or its document tokens.
    css: { postcss: { plugins: [openaiScope()] } },
    // Explicit loopback-only editor development. Production compilation ignores it.
    define: {
      "import.meta.env.EDITORIAL_LOCAL_PREVIEW": "true",
      // Not import.meta.env: Astro rewrites a private env name there into a
      // runtime process.env read, which Workers fill from wrangler vars.
      __LOCAL_OWNER_BUILD__: JSON.stringify(adminLocalOwner),
    },
    plugins: [
      ...(isolatedOwnerTest ? [isolatedPreviewAssets()] : []),
      tailwindcss(),
      adminPreviewIdentity(fileURLToPath(new URL("../..", import.meta.url))),
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
    ...(process.env.ADMIN_E2E_STATE_DIR && adminLocalOwner
      ? { persistState: { path: process.env.ADMIN_E2E_STATE_DIR } }
      : {}),
    // astro dev runs the Worker with local-only bindings: its own EDITORIAL
    // Durable Object, local D1 and local R2 under .wrangler/state. Remote
    // bindings stay off even if a binding is ever marked `remote`.
    remoteBindings: false,
  }),
});
