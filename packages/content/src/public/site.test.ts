import { expect, it } from "vitest";
import {
  footerProfileDefaults,
  navItems,
  resolveSiteSettings,
  siteConfig,
  siteLinks,
  siteSettingsSchema,
} from "./site";

it("preserves current navigation, footer and SEO when optional settings are absent", () => {
  const defaults = resolveSiteSettings();
  expect(defaults.navigation).toEqual(navItems);
  expect(defaults.footer.profiles).toEqual(footerProfileDefaults);
  expect(defaults.footer.admin).toEqual(siteLinks.admin);
  expect(defaults.footer.rss).toEqual(siteLinks.rss);
  expect(defaults.footer.prompt).toBe("have a question?");
  expect(defaults.seo).toEqual({
    homepageTitle: siteConfig.homepageTitle,
    description: siteConfig.description,
    titleSuffix: siteConfig.displayName,
    feedDescription: siteConfig.feedDescription,
  });
  expect(resolveSiteSettings({})).toEqual(defaults);
});

it("applies partial authored overrides while retaining fixed routing and identity", () => {
  const settings = siteSettingsSchema.parse({
    navigation: { work: "projects" },
    footer: {
      prompt: "Contact",
      profiles: {
        github: { label: "Code", href: "https://github.com/example" },
      },
      admin_label: "Workspace",
    },
    seo: {
      homepage_title: "Synthetic title",
      title_suffix: "Synthetic suffix",
    },
  });
  const result = resolveSiteSettings(settings);
  expect(result.navigation[0]).toEqual({ name: "projects", path: "/work" });
  expect(result.navigation[1]).toEqual(navItems[1]);
  expect(result.footer.profiles.github).toEqual({
    label: "Code",
    title: "Code",
    href: "https://github.com/example",
    icon: siteLinks.github.icon,
  });
  expect(result.footer.admin.href).toBe("/admin");
  expect(result.footer.rss.href).toBe("/feed.xml");
  expect(result.seo.description).toBe(siteConfig.description);
});

it.each([
  { footer: { profiles: { github: { href: "javascript:alert(1)" } } } },
  {
    footer: {
      profiles: { github: { href: "https://owner:secret@example.com" } },
    },
  },
  {
    footer: { profiles: { github: { href: "https://example.com/%0aheader" } } },
  },
  { navigation: { work: " " } },
  { navigation: { work: "w".repeat(301) } },
  { navigation: { admin: "Workspace" } },
  { footer: { admin_href: "https://example.com" } },
  { seo: { canonical_url: "https://example.com" } },
])("rejects unsafe or executable settings: %j", (input) => {
  expect(siteSettingsSchema.safeParse(input).success).toBe(false);
});
