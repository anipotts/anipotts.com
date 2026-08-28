export const siteConfig = {
  name: "Ani Potts",
  title: "builder and writer working with agents",
  location: "NYC",
  bio: "i work on realtime agent systems and make content about how they work.",
  shortBio: "ani potts, nyc",
  url: "https://anipotts.com",
  domain: "anipotts.com",
  email: "contact@anipotts.com",
  handle: "@anipottsbuilds",
  github: "anipotts",
  ogImage: "/og-image.png",
  headshot: "/images/ani-potts-headshot.png",
  version: "4.0.0",
} as const;

export const navItems = [
  { name: "making", path: "/making" },
  { name: "writing", path: "/writing" },
  { name: "systems", path: "/systems" },
  { name: "contact", path: "/#contact" },
] as const;
