import { publicContentContext } from "../lib/content";
import type { APIRoute } from "astro";
import { siteConfig } from "@anipotts/content/public";
import {
  projectSlug,
  publishedWriting,
  writingSlug,
  visibleProjects,
} from "../lib/content";

export const prerender = false;

const BASE = siteConfig.url;

interface Entry {
  path: string;
  priority: number;
  lastmod?: string;
}

export const GET: APIRoute = async (context) => {
  const writingEntries = await publishedWriting(
    publicContentContext(context.locals),
  );
  const projects = await visibleProjects(publicContentContext(context.locals));

  const entries: Entry[] = [
    { path: "/", priority: 1 },
    { path: "/work", priority: 0.9 },
    { path: "/writing", priority: 0.85 },
    { path: "/systems", priority: 0.9 },
    ...writingEntries.map((t) => ({
      path: `/writing/${writingSlug(t)}`,
      priority: 0.65,
      lastmod: t.data.published_at?.toISOString(),
    })),
    ...projects.map((p) => ({
      path: `/work/${projectSlug(p)}`,
      priority: 0.7,
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) =>
      `  <url><loc>${BASE}${e.path === "/" ? "" : e.path}</loc>${
        e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""
      }<priority>${e.priority}</priority></url>`,
  )
  .join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};
