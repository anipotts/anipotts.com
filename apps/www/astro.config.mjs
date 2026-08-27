// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import icon from "astro-icon";
import { publicContentHotReload } from "../../scripts/dev/public-content-hot-reload.mjs";

export default defineConfig({
  site: "https://anipotts.com",
  output: "static",
  trailingSlash: "never",
  build: { format: "file" },
  vite: {
    plugins: [publicContentHotReload()],
    server: {
      allowedHosts: ["news.anipotts.com"],
    },
  },
  adapter: cloudflare({
    platformProxy: { enabled: true },
    imageService: "passthrough",
  }),
  integrations: [icon()],
  markdown: {
    shikiConfig: { theme: "css-variables" },
  },
});
