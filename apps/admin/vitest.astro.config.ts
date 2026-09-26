import { getViteConfig } from "astro/config";
import react from "@astrojs/react";
import icon from "astro-icon";
import { fileURLToPath } from "node:url";

// Real Astro compilation and rendering, without a dev server or provider proxy.
export default getViteConfig(
  {
    define: { __LOCAL_OWNER_BUILD__: "false" },
    // Routes read bindings through src/lib/runtime-env.ts, which imports
    // the Workers runtime module. Node gets an empty stand-in.
    resolve: {
      alias: {
        "cloudflare:workers": fileURLToPath(
          new URL("./test/astro/cloudflare-workers.mjs", import.meta.url),
        ),
      },
    },
    test: { include: ["test/astro/**/*.test.mjs"] },
  },
  {
    configFile: false,
    integrations: [react(), icon({ include: { ph: ["*"] } })],
    output: "server",
  },
);
