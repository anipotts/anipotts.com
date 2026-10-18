import { z } from "zod";
import { safeHttpsUrl } from "./urls.js";

/** Code-owned identity, routing and defaults shared by rendering and previews. */
export const siteConfig = {
  name: "Ani Potts",
  displayName: "ani potts",
  title: "builder and writer working with agents",
  homepageTitle: "Ani Potts | Software Engineer Building AI Systems",
  description:
    "Ani Potts builds AI agents and data intensive software systems, and writes about working with coding agents.",
  url: "https://anipotts.com",
  email: "hello@anipotts.com",
  ogImage: "/og-image.png",
  newsletterUrl: "https://news.anipotts.com",
  adminUrl: "https://admin.anipotts.com",
  feedDescription:
    "ani potts. stuff i've figured out and felt like writing down.",
} as const;

export const navItems = [
  { name: "work", path: "/work" },
  { name: "writing", path: "/writing" },
  { name: "systems", path: "/systems" },
] as const;

export const siteLinks = {
  email: {
    label: "email",
    title: "Email",
    href: `mailto:${siteConfig.email}`,
    icon: "ph:envelope-open",
  },
  github: {
    label: "github",
    title: "GitHub",
    href: "https://github.com/anipotts",
    icon: "ph:github-logo",
  },
  linkedin: {
    label: "linkedin",
    title: "LinkedIn",
    href: "https://www.linkedin.com/in/anipotts",
    icon: "ph:linkedin-logo",
  },
  x: {
    label: "x",
    title: "X",
    href: "https://x.com/anipottsbuilds",
    icon: "ph:x-logo",
  },
  newsletter: {
    label: "newsletter",
    title: "Newsletter",
    href: siteConfig.newsletterUrl,
    icon: "ph:envelope-open",
  },
  rss: {
    label: "rss feed",
    title: "RSS feed",
    href: "/feed.xml",
    icon: "ph:rss-simple",
  },
  admin: {
    label: "admin",
    title: "Admin",
    href: "/admin",
    icon: "ph:lock-key",
  },
} as const;

export const footerProfileDefaults = {
  github: siteLinks.github,
  x: siteLinks.x,
  linkedin: siteLinks.linkedin,
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
} as const;

const settingText = z.string().trim().min(1).max(300);
const profile = z
  .object({
    label: settingText.optional(),
    href: z
      .string()
      .max(2048)
      .refine(safeHttpsUrl, "Use an HTTPS URL without credentials")
      .optional(),
  })
  .strict();
/** Optional overrides share the homepage's immutable reviewed publication.
 * Routes, icons, account identity and executable behavior remain code-owned. */
export const siteSettingsSchema = z
  .object({
    navigation: z
      .object({
        work: settingText.optional(),
        writing: settingText.optional(),
        systems: settingText.optional(),
      })
      .strict()
      .optional(),
    footer: z
      .object({
        prompt: settingText.optional(),
        rss_label: settingText.optional(),
        admin_label: settingText.optional(),
        profiles: z
          .object({
            github: profile.optional(),
            x: profile.optional(),
            linkedin: profile.optional(),
            instagram: profile.optional(),
            tiktok: profile.optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    seo: z
      .object({
        homepage_title: settingText.optional(),
        description: z.string().trim().min(1).max(1000).optional(),
        title_suffix: settingText.optional(),
        feed_description: z.string().trim().min(1).max(1000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type SiteSettings = z.infer<typeof siteSettingsSchema>;

export function resolveSiteSettings(settings?: SiteSettings) {
  const profiles = Object.fromEntries(
    Object.entries(footerProfileDefaults).map(([key, fallback]) => {
      const override =
        settings?.footer?.profiles?.[key as keyof typeof footerProfileDefaults];
      return [
        key,
        {
          ...fallback,
          label: override?.label ?? fallback.label,
          title: override?.label ?? fallback.title,
          href: override?.href ?? fallback.href,
        },
      ];
    }),
  ) as Record<
    keyof typeof footerProfileDefaults,
    {
      label: string;
      title: string;
      href: string;
      icon: string;
    }
  >;
  return {
    navigation: navItems.map((item) => ({
      ...item,
      name: settings?.navigation?.[item.name] ?? item.name,
    })),
    footer: {
      prompt: settings?.footer?.prompt ?? "have a question?",
      rss: {
        ...siteLinks.rss,
        label: settings?.footer?.rss_label ?? siteLinks.rss.label,
        title: settings?.footer?.rss_label ?? siteLinks.rss.title,
      },
      admin: {
        ...siteLinks.admin,
        label: settings?.footer?.admin_label ?? siteLinks.admin.label,
        title: settings?.footer?.admin_label ?? siteLinks.admin.title,
      },
      profiles,
    },
    seo: {
      homepageTitle: settings?.seo?.homepage_title ?? siteConfig.homepageTitle,
      description: settings?.seo?.description ?? siteConfig.description,
      titleSuffix: settings?.seo?.title_suffix ?? siteConfig.displayName,
      feedDescription:
        settings?.seo?.feed_description ?? siteConfig.feedDescription,
    },
  };
}
