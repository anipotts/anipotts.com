/**
 * Screenshots with pre-exported 800 and 1600px webp variants beside the
 * full-size file. The full-size file stays the enlarge and "open original"
 * target; cards and detail stages request a variant. Sources without an
 * entry render as before.
 */
const variantSources: Record<string, { width: number; height: number }> = {
  "/images/work/structured-drawing-chat.webp": { width: 2876, height: 1611 },
  "/images/work/paragon-portal-directory.webp": { width: 1800, height: 1044 },
  "/images/work/paragon-portal-resources.webp": { width: 1800, height: 1044 },
  "/images/work/paragon-portal-content-admin.webp": {
    width: 1800,
    height: 1044,
  },
  "/images/work/paragon-portal-analytics.webp": { width: 1800, height: 1044 },
};

/**
 * Portrait phones get the 800px file at any density: their cards are 340px
 * or narrower, so 800 device pixels still cover 2.4x. Wider viewports, such
 * as tablets and landscape phones, choose from srcset.
 */
export const phoneMedia = "(max-width: 29.99rem)";

export interface ResponsiveScreenshot {
  src: string;
  srcset: string;
  width: number;
  height: number;
  /** The full-size ratio; rounded variant heights would otherwise nudge flow layout by a pixel. */
  aspectRatio: string;
}

export function responsiveScreenshot(
  src: string,
): ResponsiveScreenshot | undefined {
  const size = variantSources[src];
  if (!size) return undefined;
  const base = src.replace(/\.[a-z0-9]+$/i, "");
  const small = `${base}-800.webp`;
  return {
    src: small,
    srcset: `${small} 800w, ${base}-1600.webp 1600w`,
    width: 800,
    height: Math.round((800 * size.height) / size.width),
    aspectRatio: `${size.width} / ${size.height}`,
  };
}
