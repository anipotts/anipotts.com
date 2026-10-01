import {
  DEFAULT_CMS_PROJECTS,
  DEFAULT_HOMEPAGE_CONTENT,
} from "@anipotts/content/public";

/** Existing public artwork only. Shape/tone are the same Markdown hints used
 * by the public inline renderer; inserting a logo never changes its asset. */
const candidates = [
  ...Object.values(DEFAULT_HOMEPAGE_CONTENT.mentions).flatMap((mention) =>
    mention.logoSrc
      ? [
          {
            src: mention.logoSrc,
            label: mention.logoAlt || mention.label,
            title:
              [
                mention.logoTone === "white" ? "white" : "",
                ["wide", "mark"].includes(mention.logoShape ?? "")
                  ? mention.logoShape
                  : "",
              ]
                .filter(Boolean)
                .join(" ") || null,
          },
        ]
      : [],
  ),
  ...DEFAULT_CMS_PROJECTS.flatMap((project) =>
    project.identity?.logo_src
      ? [
          {
            src: project.identity.logo_src,
            label: project.identity.logo_alt || project.title,
            title: project.identity.logo_tone === "adaptive" ? "white" : null,
          },
        ]
      : [],
  ),
];
// Homepage identities come first, preserving their precise inline shape hints.
export const INLINE_ICONS = candidates.filter(
  (icon, index) =>
    icon.src.startsWith("/images/brand/") &&
    candidates.findIndex((other) => other.src === icon.src) === index,
);
