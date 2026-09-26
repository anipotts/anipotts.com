// @ts-check
import { randomUUID } from "node:crypto";
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import { unified } from "@astrojs/markdown-remark";
import { publishedHeadingIds } from "./src/lib/published-heading-ids.mjs";
import icon from "astro-icon";
import { siteConfig } from "@anipotts/content/public";
import astroAdvisoryGuard from "../../config/astro/advisory-guard.mjs";

// Prerendering runs in Node (prerenderEnvironment below), where the Workers
// module does not exist. Prerendered pages have never had bindings, so the
// prerender build sees an empty env, as it saw no `locals.runtime` before.
const prerenderWorkerEnv = {
  name: "anipotts:prerender-worker-env",
  enforce: /** @type {const} */ ("pre"),
  /** @param {{ name: string }} environment */
  applyToEnvironment: (environment) => environment.name === "prerender",
  /** @param {string} id */
  resolveId(id) {
    if (id === "cloudflare:workers") return "\0prerender-cloudflare-workers";
  },
  /** @param {string} id */
  load(id) {
    if (id === "\0prerender-cloudflare-workers")
      return "export const env = {};";
  },
};

export default defineConfig({
  // No Astro sessions are used. Without this the adapter provisions a SESSION
  // KV binding that the deployed Worker has never had.
  session: false,
  // Astro 7 defaults to JSX whitespace rules. Keep the lossless HTML
  // compression the site has always shipped.
  compressHTML: true,
  // Public POST routes enforce their own boundary: subscription origin checks,
  // signed webhooks, and token-based one-click unsubscribe without browser Origin.
  security: { checkOrigin: false },
  site: siteConfig.url,
  output: "static",
  prefetch: true,
  trailingSlash: "never",
  build: { format: "file" },
  vite: {
    plugins: [prerenderWorkerEnv],
    // Fixed per build. The published reader folds it into every content
    // validator so a deploy never revalidates against another build's body.
    define: { __WWW_BUILD_ID__: JSON.stringify(randomUUID()) },
    server: {
      allowedHosts: [new URL(siteConfig.newsletterUrl).hostname],
    },
  },
  // The Worker entry is `main` in wrangler.toml (src/worker.ts). It wraps
  // the adapter handler so pages and assets it serves before middleware carry
  // the security headers too.
  adapter: cloudflare({
    imageService: "passthrough",
    // astro dev uses local-only D1, R2 and queue bindings under .wrangler/state.
    remoteBindings: false,
    // Prerendered pages and the social cards read node:fs at build time.
    prerenderEnvironment: "node",
  }),
  integrations: [
    astroAdvisoryGuard(),
    icon({
      include: {
        ph: [
          "arrow-up-right-bold",
          "activity",
          "archive",
          "arrow-bend-right-up",
          "arrow-bend-up-left",
          "book-open-text",
          "briefcase",
          "calendar-blank",
          "calendar-dots",
          "chart-line-up",
          "check-circle",
          "circle",
          "circle-half",
          "desktop-tower",
          "envelope-open",
          "github-logo",
          "hard-drives",
          "heart",
          "instagram-logo",
          "linkedin-logo",
          "lock-key",
          "pause",
          "play",
          "rss-simple",
          "seal-check",
          "spinner-gap",
          "tiktok-logo",
          "user-circle",
          "user-focus",
          "waveform",
          "x-logo",
          "youtube-logo",
        ],
      },
    }),
  ],
  markdown: {
    // Astro 7 defaults to Sätteri. Keep the remark/rehype pipeline.
    processor: unified({ rehypePlugins: [publishedHeadingIds] }),
    shikiConfig: { theme: "css-variables" },
  },
});
