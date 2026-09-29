import { getViteConfig } from "astro/config";
import react from "@astrojs/react";
import icon from "astro-icon";

// Real Astro compilation and rendering, without a dev server or provider proxy.
export default getViteConfig(
  { test: { include: ["test/astro/**/*.test.mjs"] } },
  {
    configFile: false,
    integrations: [react(), icon({ include: { ph: ["*"] } })],
    output: "server",
  },
);
