// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import icon from "astro-icon";
import { siteConfig } from "@anipotts/content/public";

export default defineConfig({
  // Public POST routes enforce their own boundary: subscription origin checks,
  // signed webhooks, and token-based one-click unsubscribe without browser Origin.
  security: { checkOrigin: false },
  site: siteConfig.url,
  output: "static",
  prefetch: true,
  trailingSlash: "never",
  build: { format: "file" },
  vite: {
    server: {
      allowedHosts: [
        new URL(siteConfig.newsletterUrl).hostname,
        ".anipotts.localhost",
      ],
    },
  },
  adapter: cloudflare({
    platformProxy: { enabled: true },
    imageService: "passthrough",
  }),
  integrations: [
    icon({
      include: {
        ph: [
          "arrow-up-right-bold",
          "activity",
          "archive",
          "arrow-bend-right-up",
          "arrow-bend-up-left",
          "arrow-left",
          "arrow-up-right",
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
    shikiConfig: { theme: "css-variables" },
  },
});
