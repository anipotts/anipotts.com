import { inlinePlainText } from "@anipotts/content/public/inline";
import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { siteConfig } from "@anipotts/content/public";
import { publishedWriting, writingSlug } from "../lib/content";

export const prerender = true;

export const GET: APIRoute = async (context) => {
  const writingEntries = (await publishedWriting()).slice(0, 50);
  const latestPublication = Math.max(
    0,
    ...writingEntries.map((entry) => entry.data.published_at?.getTime() ?? 0),
  );
  return rss({
    title: siteConfig.displayName,
    description: siteConfig.feedDescription,
    site: context.site ?? siteConfig.url,
    items: writingEntries.map((t) => ({
      title: t.data.title,
      description: inlinePlainText(t.data.summary),
      link: `/writing/${writingSlug(t)}`,
      pubDate: t.data.published_at ?? new Date(0),
    })),
    customData: `<language>en-us</language><lastBuildDate>${new Date(latestPublication).toUTCString()}</lastBuildDate>`,
  });
};
