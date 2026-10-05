import { siteConfig } from "@anipotts/content/public/site";

/** The dev manager supplies this worktree's public preview origin to both islands and server code. */
export const publicSiteUrl = import.meta.env.DEV
  ? (import.meta.env.PUBLIC_DEV_SITE_URL ?? "http://127.0.0.1:4321/")
  : siteConfig.url;
