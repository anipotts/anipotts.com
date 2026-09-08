import { siteConfig, siteLinks } from "@anipotts/content/public";

// Shared with author references on Coding Agent Tips.
export const personId = `${siteConfig.url}/#person`;
export const websiteId = `${siteConfig.url}/#website`;

export const creatorLinks = {
  instagram: {
    label: "instagram",
    title: "Instagram · @anipottsbuilds",
    href: "https://www.instagram.com/anipottsbuilds/",
    icon: "ph:instagram-logo",
  },
  tiktok: {
    label: "tiktok",
    title: "TikTok · @anipottsbuilds",
    href: "https://www.tiktok.com/@anipottsbuilds",
    icon: "ph:tiktok-logo",
  },
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
