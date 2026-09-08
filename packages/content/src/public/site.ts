/** Git-owned identity and destinations shared by public rendering and previews. */
export const siteConfig = {
  name: "Ani Potts",
  displayName: "ani potts",
  title: "builder and writer working with agents",
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
