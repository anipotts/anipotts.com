import { getViteConfig } from "astro/config";
import react from "@astrojs/react";
import icon from "astro-icon";
import { previewIcons } from "./src/lib/preview-icons.mjs";
import { fileURLToPath } from "node:url";

// This suite imports the production bundle. Build before running it so
// assertions cover the current source, not a stale dist directory.
export default getViteConfig(
  {
    define: { __LOCAL_OWNER_BUILD__: "false" },
    resolve: {
      alias: {
        "cloudflare:workers": fileURLToPath(
          new URL("./test/astro/cloudflare-workers.mjs", import.meta.url),
        ),
      },
    },
    test: { include: ["test/astro/**/*.verify.mjs"] },
  },
  {
    configFile: false,
    integrations: [react(), icon({ include: previewIcons })],
    output: "server",
  },
);
