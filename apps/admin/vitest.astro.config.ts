import { getViteConfig } from "astro/config";
import react from "@astrojs/react";

// Real Astro compilation and rendering, without a dev server or provider proxy.
export default getViteConfig(
  { test: { include: ["test/astro/**/*.test.mjs"] } },
  { configFile: false, integrations: [react()], output: "server" },
);
