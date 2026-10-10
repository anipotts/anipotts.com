import {
  siteConfig,
  siteLinks,
  footerProfileDefaults,
} from "@anipotts/content/public/site";

// Shared with author references on agents.anipotts.com.
export const personId = `${siteConfig.url}/#person`;
export const websiteId = `${siteConfig.url}/#website`;

export const creatorLinks = {
  instagram: footerProfileDefaults.instagram,
  tiktok: footerProfileDefaults.tiktok,
  youtube: {
    label: "youtube",
    title: "YouTube · @anipottsbuilds",
    href: "https://www.youtube.com/@anipottsbuilds",
    icon: "ph:youtube-logo",
  },
} as const;

export const personIdentity = {
  "@type": "Person",
  "@id": personId,
  name: siteConfig.name,
  alternateName: ["anipotts", "anipottsbuilds"],
  url: siteConfig.url,
  sameAs: [
    siteLinks.github.href,
    siteLinks.linkedin.href,
    siteLinks.x.href,
    ...Object.values(creatorLinks).map((link) => link.href),
  ],
};
