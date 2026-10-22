import client from "../../../www/src/scripts/preview-client.js?raw";
import { fromHtml } from "hast-util-from-html";
import { unified } from "unified";
import rehypeStringify from "rehype-stringify";
import type { Element, Root, RootContent } from "hast";

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
function devStyleKey(path: string) {
  const url = new URL(path, "http://localhost");
  return decodeURIComponent(url.pathname).replace(/^\/@fs/, "") + url.search;
}
function devRouterStyle(path: string) {
  const url = new URL(path, "http://localhost");
  if (
    [...url.searchParams.keys()].some(
      (key) => !["astro", "type", "index", "lang.css", "t", "v"].includes(key),
    )
  )
    return false;
  const file = decodeURIComponent(url.pathname).replace(/^\/@fs/, "");
  const prefix = `${__PREVIEW_PUBLIC_SOURCE_ROOT__}/node_modules/`;
  if (!file.startsWith(prefix)) return false;
  const component =
    /^(?:\.pnpm\/astro@[^/]+\/node_modules\/)?astro\/components\/(ClientRouter\.astro|viewtransitions\.css)$/.exec(
      file.slice(prefix.length),
    )?.[1];
  return (
    component === "viewtransitions.css" ||
    (component === "ClientRouter.astro" &&
      url.searchParams.has("astro") &&
      url.searchParams.get("type") === "style")
  );
}
function devPublicScript(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  const url = new URL(path, "http://localhost");
  if (
    url.hash ||
    [...url.searchParams.keys()].some(
      (key) =>
        !["astro", "type", "index", "lang.ts", "lang.js", "t", "v"].includes(
          key,
        ),
    )
  )
    return false;
  if (
    !url.searchParams.has("astro") ||
    url.searchParams.get("type") !== "script" ||
    (url.searchParams.has("index") && url.searchParams.get("index") !== "0")
  )
    return false;
  const file = decodeURIComponent(url.pathname).replace(/^\/@fs/, "");
  const root = __PREVIEW_PUBLIC_SOURCE_ROOT__;
  return (
    [
      "components/Nav",
      "components/ProjectMediaStage",
      "components/SystemMap",
      "layouts/Shell",
    ].some((name) => file === `${root}/apps/www/src/${name}.astro`) ||
    (file.startsWith(`${root}/node_modules/`) &&
      /^(?:\.pnpm\/astro@[^/]+\/node_modules\/)?astro\/components\/ClientRouter\.astro$/.test(
        file.slice(`${root}/node_modules/`.length),
      ))
  );
}

type Resource = { element: Element; parent: Root | Element; foreign: boolean };
function resources(tree: Root): Resource[] {
  const found: Resource[] = [];
  const pending: Array<{
    node: RootContent;
    parent: Root | Element;
    foreign: boolean;
  }> = tree.children
    .map((node) => ({ node, parent: tree, foreign: false }))
    .reverse();
  while (pending.length) {
    const { node, parent, foreign: inherited } = pending.pop()!;
    if (node.type !== "element") continue;
    const foreign =
      inherited || ["svg", "math"].includes(node.tagName.toLowerCase());
    found.push({ element: node, parent, foreign });
    const content = (node as Element & { content?: Root }).content;
    if (content)
      for (let i = content.children.length - 1; i >= 0; i--)
        pending.push({ node: content.children[i], parent: content, foreign });
    for (let i = node.children.length - 1; i >= 0; i--)
      pending.push({ node: node.children[i], parent: node, foreign });
  }
  return found;
}
function property(element: Element, name: string): string | undefined {
  const value = element.properties[name];
  return typeof value === "string"
    ? value
    : typeof value === "number"
      ? String(value)
      : undefined;
}
function relations(element: Element): string[] {
  const value = element.properties.rel;
  return (
    Array.isArray(value) ? value.map(String) : String(value ?? "").split(/\s+/)
  ).map((token) => token.toLowerCase());
}
function replace(resource: Resource, replacement: Element | null) {
  const index = resource.parent.children.indexOf(resource.element);
  if (index < 0) throw new Error("Invalid preview resource tree");
  if (replacement) resource.parent.children.splice(index, 1, replacement);
  else resource.parent.children.splice(index, 1);
}
function styleElement(css: string): Element {
  if (css.toLowerCase().includes("</style"))
    throw new Error("Invalid preview CSS terminator");
  return {
    type: "element",
    tagName: "style",
    properties: { dataPreviewPublicStyle: true },
    children: [{ type: "text", value: css }],
  };
}
const stringify = unified().use(rehypeStringify, {
  characterReferences: { useNamedReferences: true },
});

/** Closed public CSS/font inputs, one import-free script. No draft bytes enter ASSETS. */
export async function materializePreviewAssets(
  html: string,
  requestUrl: URL,
  reader: PreviewAssetReader,
  dev: boolean,
) {
  if (new TextEncoder().encode(html).length > MAX_PACKAGE)
    throw new Error("Preview document budget exceeded");
  const tree = fromHtml(html);
  const nodes = resources(tree);
  const links = nodes.filter(
    ({ element }) => element.tagName.toLowerCase() === "link",
  );
  const stylePaths = links
    .filter(({ element }) => relations(element).includes("stylesheet"))
    .map(({ element }) => property(element, "href") ?? "");
  if (stylePaths.length > 32) throw new Error("Preview style count exceeded");
  const inlineStyles = dev
    ? nodes.filter(
        ({ element }) =>
          element.tagName.toLowerCase() === "style" &&
          property(element, "dataViteDevId") !== undefined,
      )
    : [];
  const pairedStyles = new Set<string>();
  const routerStyles = new Set<string>();
  let pack: AssetPackage;
  if (dev) {
    const styles: AssetPackage["styles"] = [];
    for (const { element, foreign } of inlineStyles) {
      if (foreign) throw new Error("Unapproved preview foreign style");
      const path = property(element, "dataViteDevId")!;
      if (devRouterStyle(path)) {
        routerStyles.add(devStyleKey(path));
        continue;
      }
      if (devFile(path) !== "style")
        throw new Error("Unapproved preview inline style");
      pairedStyles.add(devStyleKey(path));
      const css = element.children
        .map((child) => {
          if (child.type !== "text")
            throw new Error("Invalid preview style content");
          return child.value;
        })
        .join("");
      styles.push({ path, css });
    }
    if (inlineStyles.length + stylePaths.length > 32)
      throw new Error("Preview style count exceeded");
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
      styles.push({ path, css: new TextDecoder().decode(value.bytes) });
      pairedStyles.add(devStyleKey(path));
    }
    for (const { css } of styles) {
      const length = new TextEncoder().encode(css).length;
      total += length;
      if (length > MAX_STYLE || total > 1024 * 1024)
        throw new Error("Preview style budget exceeded");
      for (const match of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) {
        if (match[1].startsWith("data:") || match[1].startsWith("#")) continue;
        if (devFile(match[1]) !== "font")
          throw new Error("Unapproved preview CSS resource");
        fonts.add(match[1]);
      }
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
      if (style.css.toLowerCase().includes("</style"))
        throw new Error("Invalid preview CSS terminator");
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
  for (const resource of inlineStyles) {
    const path = property(resource.element, "dataViteDevId")!;
    if (routerStyles.has(devStyleKey(path))) {
      replace(resource, null);
      continue;
    }
    const css = styles.get(path);
    if (css === undefined) throw new Error("Unmanifested preview inline style");
    replace(resource, styleElement(css));
  }
  for (const resource of links) {
    const rel = relations(resource.element);
    const href = property(resource.element, "href") ?? "";
    if (rel.includes("stylesheet")) {
      if (resource.foreign)
        throw new Error("Unapproved preview foreign stylesheet");
      const css = styles.get(href);
      if (css === undefined) throw new Error("Unmanifested preview stylesheet");
      replace(resource, styleElement(css));
    } else if (
      (property(resource.element, "as")?.toLowerCase() === "font" &&
        rel.includes("preload")) ||
      rel.includes("modulepreload")
    )
      replace(resource, null);
  }
  for (const resource of nodes) {
    if (resource.element.tagName.toLowerCase() !== "script") continue;
    if (resource.foreign) throw new Error("Unapproved preview foreign script");
    const src = property(resource.element, "src");
    if (src === undefined) continue; // Trusted renderer product inline code.
    if (dev && (devFile(src) === "style" || devRouterStyle(src))) {
      const key = devStyleKey(src);
      if (pairedStyles.has(key) || routerStyles.has(key)) {
        replace(resource, null);
        continue;
      }
      throw new Error("Unpaired preview style module");
    }
    const knownDev =
      dev &&
      (src === "/@vite/client" ||
        src === "/@id/astro/runtime/client/dev-toolbar/entrypoint.js" ||
        devPublicScript(src));
    // Only explicit trusted public scripts are replaced. Systems retains its
    // complete static workflow; unknown external scripts always fail closed,
    // including template content and alternate HTML attribute spellings.
    if (!knownDev && !pack.scripts.includes(src))
      throw new Error("Unmanifested preview script");
    replace(resource, null);
  }
  const ready = `installPreviewClient(); installOwnedPreviewMedia().then(healthy => { if (!healthy()) return; parent.postMessage({type:"editorial-preview-status",request:new URL(location.href).searchParams.get("previewRequest") ?? "",status:"ready"},"*"); }, () => { parent.postMessage({type:"editorial-preview-status",request:new URL(location.href).searchParams.get("previewRequest") ?? "",status:"unavailable"},"*"); console.error("Preview media unavailable"); });`;
  const script = `${client}\n${ready}`;
  if (script.toLowerCase().includes("</script"))
    throw new Error("Invalid preview client terminator");
  const body = nodes.find(
    ({ element, foreign }) => !foreign && element.tagName === "body",
  )?.element;
  if (!body) throw new Error("Preview body missing");
  body.children.push({
    type: "element",
    tagName: "script",
    properties: { type: "module", dataPreviewPublicClient: true },
    children: [{ type: "text", value: script }],
  });
  html = stringify.stringify(tree);
  if (new TextEncoder().encode(html).length > 4 * 1024 * 1024)
    throw new Error("Materialized preview budget exceeded");
  return html;
}
