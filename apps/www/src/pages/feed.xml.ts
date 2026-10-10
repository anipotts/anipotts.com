import { publicContentContext } from "../lib/content";
import { inlinePlainText } from "@anipotts/content/public/inline";
import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { siteConfig, resolveSiteSettings } from "@anipotts/content/public/site";
import { publishedSiteSettings } from "../lib/site-settings";
import { publishedWriting, writingSlug } from "../lib/content";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const content = publicContentContext(context.locals);
  const settings = resolveSiteSettings(await publishedSiteSettings(content));
  const writingEntries = (await publishedWriting(content)).slice(0, 50);
  const latestPublication = Math.max(
    0,
    ...writingEntries.map((entry) => entry.data.published_at?.getTime() ?? 0),
  );
  return rss({
    title: siteConfig.displayName,
    description: settings.seo.feedDescription,
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
