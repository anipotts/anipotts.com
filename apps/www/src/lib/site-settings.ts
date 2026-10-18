import {
  siteSettingsSchema,
  type SiteSettings,
} from "@anipotts/content/public/site";
import {
  publicationData,
  type PublicContentContext,
} from "./published-runtime";

/** Read settings from the same immutable inventory as the current page. */
export async function publishedSiteSettings(
  context: PublicContentContext,
): Promise<SiteSettings | undefined> {
  const home = (await context.inventory).publications.find(
    (item) => item.record.kind === "page" && item.record.id === "home",
  );
  if (!home) return undefined;
  const data = publicationData(context, home).data as Record<string, unknown>;
  return data.site_settings === undefined
    ? undefined
    : siteSettingsSchema.parse(data.site_settings);
}
