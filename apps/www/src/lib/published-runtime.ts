import {
  getPublishedInventory,
  getPublishedInventoryVersion,
  type PublishedSnapshot,
} from "@anipotts/content/editorial/direct-publication";
import { CONTENT_SCHEMA_VERSION } from "@anipotts/content/editorial/publication-contract";
import {
  parseEditorialSource,
  type EditorialRecord,
} from "@anipotts/content/editorial/source";
import { projectSchema, writingSchema } from "@anipotts/content/public/schema";
import { isPublicProject, isPublishedWriting } from "@anipotts/content/public";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import rehypeSanitize from "rehype-sanitize";

export type PublishedInventory = Awaited<
  ReturnType<typeof getPublishedInventory>
>;
export type PublicContentContext = {
  /** The full coherent read. It starts on first use, so a revalidation that
   * needs only the version never loads the publications. */
  readonly inventory: Promise<PublishedInventory>;
  /** The inventory counter alone, for answering revalidations. */
  readonly version: Promise<number>;
  parsed: Map<string, ReturnType<typeof parseEditorialSource>>;
  rendered: Map<string, Promise<string>>;
};
const requests = new WeakMap<object, PublicContentContext>();
export function publicContentContext(locals: App.Locals): PublicContentContext {
  let context = requests.get(locals);
  if (!context) {
    const env = locals.runtime?.env;
    // The content store is the only runtime. Both reads share the mode and
    // binding guards, so any mode other than "cms" or a missing database
    // fails closed before storage is read.
    const guarded = <T>(read: (db: D1Database) => Promise<T>) =>
      env?.CONTENT_RUNTIME !== "cms"
        ? Promise.reject(new Error("content_runtime_mode_invalid"))
        : env?.CONTENT_DB
          ? read(env.CONTENT_DB)
          : Promise.reject(new Error("content_database_unavailable"));
    let inventory: Promise<PublishedInventory> | undefined;
    let version: Promise<number> | undefined;
    context = {
      get inventory() {
        return (inventory ??= guarded(getPublishedInventory));
      },
      get version() {
        return (version ??= inventory
          ? inventory.then((value) => value.version)
          : guarded(getPublishedInventoryVersion));
      },
      parsed: new Map(),
      rendered: new Map(),
    };
    requests.set(locals, context);
  }
  return context;
}

export function publicationData(
  context: PublicContentContext,
  publication: PublishedSnapshot,
) {
  let parsed = context.parsed.get(publication.publicationId);
  if (!parsed) {
    parsed = parseEditorialSource(publication.source);
    context.parsed.set(publication.publicationId, parsed);
  }
  return parsed;
}

export function publicationIsVisible(
  context: PublicContentContext,
  publication: PublishedSnapshot,
): boolean {
  const data = publicationData(context, publication).data;
  if (publication.record.kind === "writing")
    return isPublishedWriting(writingSchema.parse(data));
  if (publication.record.kind === "work")
    return isPublicProject(projectSchema.parse(data));
  return publication.record.id !== "newsletter";
}

/** Overlay complete editable records before filtering public visibility. */
export function overlayByIdentity<T extends { id: string }>(
  base: T[],
  overrides: T[],
): T[] {
  const entries = new Map(base.map((entry) => [entry.id, entry]));
  for (const entry of overrides) entries.set(entry.id, entry);
  return [...entries.values()];
}
let processor: ReturnType<typeof createMarkdownProcessor> | undefined;
export function publicationHtml(
  context: PublicContentContext,
  publication: PublishedSnapshot,
): Promise<string> {
  let rendered = context.rendered.get(publication.publicationId);
  if (!rendered) {
    rendered = publicMarkdownHtml(publicationData(context, publication).body);
    context.rendered.set(publication.publicationId, rendered);
  }
  return rendered;
}
export async function publicMarkdownHtml(body: string): Promise<string> {
  processor ??= createMarkdownProcessor({
    syntaxHighlight: false,
    rehypePlugins: [rehypeSanitize],
  });
  return (await (await processor).render(body)).code;
}
export async function publicationFor(
  context: PublicContentContext,
  record: EditorialRecord,
) {
  return (await context.inventory).publications.find(
    (item) => item.record.kind === record.kind && item.record.id === record.id,
  );
}
/** Headers for every CMS response that is not a cacheable 200: redirects,
 * 404s, the verification API and editorial media. */
export function publicVersionHeaders(version: number) {
  return {
    "Cache-Control": "no-store",
    "CDN-Cache-Control": "no-store",
    "Cloudflare-CDN-Cache-Control": "no-store",
    "X-Content-Version": String(version),
    "X-Content-Schema": String(CONTENT_SCHEMA_VERSION),
  };
}

declare const __WWW_BUILD_ID__: string | undefined;
/** Identity of the deployed code. A page renders from code plus inventory, so
 * a deploy has to change every tag even when the inventory stays the same.
 * The build id is fixed when the bundle is built, so every isolate of one
 * deployment agrees on it. */
const RELEASE_IDENTITY = `${import.meta.env.PUBLIC_RELEASE_SHA || "dev"}.${
  typeof __WWW_BUILD_ID__ === "string" ? __WWW_BUILD_ID__ : "unbuilt"
}`;

/** Strong validator for a published route. It changes on every activation
 * (the inventory version), on a content schema change and on every deploy,
 * and it is the same in every isolate, so it can be computed before any
 * rendering. Content routes read nothing else per request: no query string,
 * cookie, host or request header changes their body. */
export async function publicEntityTag(
  version: number,
  pathname: string,
): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${RELEASE_IDENTITY}\n${pathname}`),
    ),
  );
  const route = [...digest.slice(0, 12)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `"cms${CONTENT_SCHEMA_VERSION}-v${version}-${route}"`;
}

/** A published 200 revalidates on every use, so a publish is visible on the
 * next request. Shared caches stay out: the only shared copy is the
 * version-keyed edge entry below. */
export function publicCacheHeaders(version: number, etag: string) {
  return {
    "Cache-Control": "public, max-age=0, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Cloudflare-CDN-Cache-Control": "no-store",
    ETag: etag,
    "X-Content-Version": String(version),
    "X-Content-Schema": String(CONTENT_SCHEMA_VERSION),
  };
}

type EdgeCache = {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
};
/** The colo's Cache API, when the runtime has one. */
export function publicEdgeCache(): EdgeCache | null {
  const cache = (globalThis as { caches?: { default?: Partial<EdgeCache> } })
    .caches?.default;
  return typeof cache?.match === "function" && typeof cache.put === "function"
    ? (cache as EdgeCache)
    : null;
}
/** One entry per host, route and validator. The validator carries the
 * inventory version and the release, so a publish or a deploy moves every
 * route to a new key and an old entry can never answer. */
export function edgeCacheKey(url: URL, etag: string): string {
  const key = new URL(url.pathname, url.origin);
  key.searchParams.set("cms-etag", etag.replaceAll('"', ""));
  return key.href;
}
const EDGE_TTL_SECONDS = 86_400;
const EDGE_KEPT_HEADERS = ["content-type", "x-content-sha256"];
/** The stored copy keeps the body, the headers the route chose and a TTL for
 * the colo cache only. Clients never see this Cache-Control. */
export function edgeCacheCopy(response: Response): Response {
  const headers = new Headers({
    "Cache-Control": `public, max-age=${EDGE_TTL_SECONDS}`,
  });
  for (const name of EDGE_KEPT_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return new Response(response.body, { status: 200, headers });
}
/** A stored copy served again with the public headers for its validator. */
export function fromEdgeCache(
  cached: Response,
  version: number,
  etag: string,
  head: boolean,
): Response {
  const headers = new Headers(publicCacheHeaders(version, etag));
  for (const name of EDGE_KEPT_HEADERS) {
    const value = cached.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  headers.set("X-Content-Cache", "hit");
  if (head) void cached.body?.cancel();
  return new Response(head ? null : cached.body, { status: 200, headers });
}
export function contentUnavailable() {
  return new Response("Content unavailable", {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
      "Retry-After": "30",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
