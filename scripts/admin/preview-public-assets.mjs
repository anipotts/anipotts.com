import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packagePath = "__preview/public-assets.json";
const previewRoutes = new Set(["/preview/home", "/preview/record"]);
const font =
  /^\/_astro\/(?:APStructuralDisplayBlack-v[\w.-]+|(?:instrument-sans|jetbrains-mono)-(?:latin|latin-ext)-wght-normal)\.[\w-]+\.woff2$/;

/** A single deployment owns both this fixed asset package and its renderer. */
export function previewPublicAssets() {
  let styles = [];
  let scripts = [];
  return {
    name: "owner-preview-public-assets",
    hooks: {
      "astro:build:ssr": ({ manifest }) => {
        styles = [
          ...new Set(
            manifest.routes
              .filter((route) => previewRoutes.has(route.routeData.route))
              .flatMap((route) =>
                route.styles
                  .filter((style) => style.type === "external")
                  .map((style) => `/${style.src.replace(/^\//, "")}`),
              ),
          ),
        ];
        scripts = Object.entries(manifest.entryModules)
          .filter(
            ([source]) =>
              /\/apps\/www\/src\/(?:components\/(?:Nav|ProjectMediaStage|SystemMap)|layouts\/Shell)\.astro\?/.test(
                source,
              ) || /\/astro\/components\/ClientRouter\.astro\?/.test(source),
          )
          .map(([, path]) => `/${path.replace(/^\//, "")}`);
      },
      "astro:build:done": async ({ dir }) => {
        if (styles.length < 1 || styles.length > 32)
          throw new Error("Missing or excessive preview styles");
        const root = fileURLToPath(dir);
        const read = async (path) => {
          if (!/^\/_astro\/[\w.-]+\.(?:css|woff2)$/.test(path))
            throw new Error("Invalid preview asset");
          const file = resolve(root, `.${path}`);
          if (!file.startsWith(root.replace(/\/$/, "") + sep))
            throw new Error("Invalid preview asset root");
          return readFile(file);
        };
        const fonts = new Set();
        let styleBytes = 0;
        const css = [];
        for (const path of styles) {
          const bytes = await read(path);
          styleBytes += bytes.length;
          if (bytes.length > 256 * 1024 || styleBytes > 1024 * 1024)
            throw new Error("Preview style budget exceeded");
          const text = bytes.toString("utf8");
          if (/@import\b/i.test(text))
            throw new Error("Unapproved preview CSS import");
          for (const match of text.matchAll(
            /url\(\s*["']?([^\s"')]+)["']?\s*\)/g,
          )) {
            if (match[1].startsWith("data:") || match[1].startsWith("#"))
              continue;
            if (!font.test(match[1]))
              throw new Error("Unapproved preview CSS resource");
            fonts.add(match[1]);
          }
          css.push({ path, css: text });
        }
        if (fonts.size > 8) throw new Error("Preview font count exceeded");
        const embeddedFonts = [];
        let fontBytes = 0;
        for (const path of fonts) {
          const bytes = await read(path);
          fontBytes += bytes.length;
          if (bytes.length > 256 * 1024 || fontBytes > 1024 * 1024)
            throw new Error("Preview font budget exceeded");
          embeddedFonts.push({ path, data: bytes.toString("base64") });
        }
        const json = JSON.stringify({
          version: 1,
          styles: css,
          fonts: embeddedFonts,
          scripts,
        });
        if (Buffer.byteLength(json) > 2 * 1024 * 1024)
          throw new Error("Preview asset package budget exceeded");
        await mkdir(resolve(root, "__preview"), { recursive: true });
        await writeFile(resolve(root, packagePath), json);
      },
    },
  };
}
