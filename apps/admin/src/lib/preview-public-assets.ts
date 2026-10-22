import client from "../../../www/src/scripts/preview-client.js?raw";

declare const __PREVIEW_PUBLIC_SOURCE_ROOT__: string;
export type PreviewAssetReader = { fetch(request: Request): Promise<Response> };
export const PREVIEW_ASSET_PACKAGE = "/__preview/public-assets.json";
const MAX_PACKAGE = 2 * 1024 * 1024;
const MAX_STYLE = 256 * 1024;
const MAX_FONTS = 8;
const fontName =
  /^(?:APStructuralDisplayBlack-v[\w.-]+|(?:instrument-sans|jetbrains-mono)-(?:latin|latin-ext)-wght-normal)(?:\.[\w-]+)?\.woff2$/;
type AssetPackage = {
  version: 1;
  styles: Array<{ path: string; css: string }>;
  fonts: Array<{ path: string; data: string }>;
  scripts: string[];
};

function pathname(value: string) {
  return value.replaceAll("&amp;", "&");
}
async function read(
  reader: PreviewAssetReader,
  origin: URL,
  path: string,
  max: number,
) {
  const target = new URL(path, origin);
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    target.origin !== origin.origin ||
    target.username ||
    target.password ||
    target.hash
  )
    throw new Error("Unapproved preview asset origin");
  const response = await reader.fetch(
    new Request(new URL(path, origin), {
      headers: { Accept: path.includes("direct") ? "text/css" : "*/*" },
    }),
  );
  if (!response.ok) throw new Error("Preview asset unavailable");
  if (Number(response.headers.get("Content-Length")) > max)
    throw new Error("Preview asset budget exceeded");
  const stream = response.body?.getReader();
  if (!stream) throw new Error("Preview asset missing");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await stream.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > max) throw new Error("Preview asset budget exceeded");
      chunks.push(chunk.value);
    }
  } finally {
    await stream.cancel().catch(() => {});
    stream.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { bytes, type: response.headers.get("Content-Type") ?? "" };
}
function base64(bytes: Uint8Array) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
function devFile(path: string) {
  const url = new URL(path, "http://localhost");
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    [...url.searchParams.keys()].some(
      (key) => !["astro", "type", "index", "lang.css", "t", "v"].includes(key),
    )
  )
    return null;
  const file = decodeURIComponent(url.pathname).replace(/^\/@fs/, "");
  if (file.includes("\\") || file.split("/").includes("..")) return null;
  const root = __PREVIEW_PUBLIC_SOURCE_ROOT__;
  const publicStyle =
    ["components/", "layouts/", "styles/"].some((dir) =>
      file.startsWith(`${root}/apps/www/src/${dir}`),
    ) || file === `${root}/packages/brand/src/BrandMark.astro`;
  const style =
    publicStyle &&
    (file.endsWith(".css") ||
      (file.endsWith(".astro") &&
        url.searchParams.has("astro") &&
        url.searchParams.get("type") === "style"));
  const font =
    fontName.test(file.split("/").at(-1) ?? "") &&
    (file.startsWith(
      `${root}/packages/brand/ap-structural-v0.2.0-candidate.1/fonts/`,
    ) ||
      (file.startsWith(`${root}/node_modules/.pnpm/@fontsource-variable+`) &&
        /\/node_modules\/@fontsource-variable\/(?:instrument-sans|jetbrains-mono)\/files\//.test(
          file,
        )));
  return style ? "style" : font ? "font" : null;
}
function attributes(text: string) {
  return new Map(
    [...text.matchAll(/([\w-]+)="([^"<>]*)"/g)].map((match) => [
      match[1].toLowerCase(),
      pathname(match[2]),
    ]),
  );
}

/** Closed public CSS/font inputs, one import-free script. No draft bytes enter ASSETS. */
export async function materializePreviewAssets(
  html: string,
  requestUrl: URL,
  reader: PreviewAssetReader,
  dev: boolean,
) {
  if (new TextEncoder().encode(html).length > MAX_PACKAGE)
    throw new Error("Preview document budget exceeded");
  const links = [...html.matchAll(/<link\b([^>]*)>/g)];
  const stylePaths = links
    .filter((match) => attributes(match[1]).get("rel") === "stylesheet")
    .map((match) => attributes(match[1]).get("href") ?? "");
  if (stylePaths.length > 32) throw new Error("Preview style count exceeded");
  let pack: AssetPackage;
  if (dev) {
    const styles = [];
    const fonts = new Set<string>();
    let total = 0;
    for (const path of stylePaths) {
      if (devFile(path) !== "style")
        throw new Error("Unapproved preview style");
      const url = new URL(path, requestUrl);
      if (url.origin !== requestUrl.origin)
        throw new Error("Unapproved preview origin");
      url.searchParams.set("direct", "");
      const value = await read(
        reader,
        requestUrl,
        url.pathname + url.search,
        MAX_STYLE,
      );
      if (!value.type.includes("text/css"))
        throw new Error("Preview style type mismatch");
      total += value.bytes.length;
      if (total > 1024 * 1024) throw new Error("Preview style budget exceeded");
      const css = new TextDecoder().decode(value.bytes);
      for (const match of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) {
        if (match[1].startsWith("data:") || match[1].startsWith("#")) continue;
        if (devFile(match[1]) !== "font")
          throw new Error("Unapproved preview CSS resource");
        fonts.add(match[1]);
      }
      styles.push({ path, css });
    }
    if (fonts.size > MAX_FONTS) throw new Error("Preview font count exceeded");
    const data = [];
    let fontBytes = 0;
    for (const path of fonts) {
      const value = await read(reader, requestUrl, path, MAX_STYLE);
      fontBytes += value.bytes.length;
      if (
        !/^(?:font\/woff2|application\/(?:font-woff|octet-stream))/.test(
          value.type,
        ) ||
        fontBytes > 1024 * 1024
      )
        throw new Error("Preview font type/budget mismatch");
      data.push({ path, data: base64(value.bytes) });
    }
    pack = { version: 1, styles, fonts: data, scripts: [] };
  } else {
    const value = await read(
      reader,
      requestUrl,
      PREVIEW_ASSET_PACKAGE,
      MAX_PACKAGE,
    );
    pack = JSON.parse(new TextDecoder().decode(value.bytes));
    if (
      pack.version !== 1 ||
      !Array.isArray(pack.styles) ||
      pack.styles.length > 32 ||
      !Array.isArray(pack.fonts) ||
      pack.fonts.length > MAX_FONTS ||
      !Array.isArray(pack.scripts) ||
      pack.scripts.length > 16
    )
      throw new Error("Invalid preview asset package");
  }
  const fonts = new Map(
    pack.fonts.map((font) => {
      if (
        typeof font.path !== "string" ||
        !fontName.test(font.path.split("/").at(-1) ?? "") ||
        typeof font.data !== "string" ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(font.data) ||
        font.data.length > 350000
      )
        throw new Error("Invalid preview font");
      return [font.path, `data:font/woff2;base64,${font.data}`];
    }),
  );
  const styles = new Map(
    pack.styles.map((style) => {
      if (
        typeof style.path !== "string" ||
        typeof style.css !== "string" ||
        style.css.length > MAX_STYLE ||
        (!dev && !/^\/_astro\/[\w.-]+\.css$/.test(style.path))
      )
        throw new Error("Invalid preview style");
      if (/@import\b/i.test(style.css))
        throw new Error("Unapproved preview CSS import");
      const css = style.css.replace(
        /url\(\s*(["']?)([^\s"')]+)\1\s*\)/g,
        (_, quote, path: string) => {
          if (path.startsWith("data:") || path.startsWith("#"))
            return `url(${quote}${path}${quote})`;
          const font = fonts.get(path);
          if (!font) throw new Error("Unapproved preview CSS resource");
          return `url("${font}")`;
        },
      );
      return [style.path, css];
    }),
  );
  html = html.replace(/<link\b([^>]*)>/g, (tag, raw) => {
    const attr = attributes(raw);
    const href = attr.get("href") ?? "";
    if (attr.get("rel") === "stylesheet") {
      const css = styles.get(href);
      if (css === undefined) throw new Error("Unmanifested preview stylesheet");
      return `<style data-preview-public-style>${css.replace(/<\/style/gi, "<\\/style")}</style>`;
    }
    if (attr.get("as") === "font" && attr.get("rel") === "preload") return "";
    if (attr.get("rel") === "modulepreload") return "";
    return tag;
  });
  html = html.replace(/<script\b([^>]*)>\s*<\/script>/g, (tag, raw) => {
    const src = attributes(raw).get("src");
    if (!src) return tag;
    const decoded = pathname(src);
    const knownDev =
      dev &&
      (decoded === "/@vite/client" ||
        decoded === "/@id/astro/runtime/client/dev-toolbar/entrypoint.js" ||
        /\/apps\/www\/src\/(?:components\/(?:Nav|ProjectMediaStage|SystemMap)|layouts\/Shell)\.astro\?astro&type=script/.test(
          decoded,
        ) ||
        /\/node_modules\/astro\/components\/ClientRouter\.astro\?astro&type=script/.test(
          decoded,
        ));
    // Systems previews retain the complete, wrapped source list and hidden
    // motion control rendered by SystemMap; only its decorative marquee is
    // omitted. Ordinary public pages still mount their normal animation.
    if (knownDev || pack.scripts.includes(decoded)) return "";
    throw new Error("Unmanifested preview script");
  });
  const ready = `installPreviewClient(); installOwnedPreviewMedia().then(healthy => { if (!healthy()) return; parent.postMessage({type:"editorial-preview-status",request:new URL(location.href).searchParams.get("previewRequest") ?? "",status:"ready"},"*"); }, () => { parent.postMessage({type:"editorial-preview-status",request:new URL(location.href).searchParams.get("previewRequest") ?? "",status:"unavailable"},"*"); console.error("Preview media unavailable"); });`;
  const script = `${client}\n${ready}`.replace(/<\/script/gi, "<\\/script");
  html = html.replace(
    "</body>",
    `<script type="module" data-preview-public-client>${script}</script></body>`,
  );
  if (new TextEncoder().encode(html).length > 4 * 1024 * 1024)
    throw new Error("Materialized preview budget exceeded");
  return html;
}
