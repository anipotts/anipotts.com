import type { APIRoute } from "astro";
import { siteConfig } from "@anipotts/content/public";
import { publishedWriting, writingSlug } from "../../lib/content";
import { SITE_CARD, writingCard } from "../../lib/social-card/routes";
// The painter is plain Node: it reads the display face and the monogram from
// the brand packet and rasterises the card itself, so the build needs no
// browser and no image dependency.
import { renderCard } from "../../lib/social-card/card.mjs";

export const prerender = true;

export async function getStaticPaths() {
  const essays = await publishedWriting();
  return [
    { params: { card: SITE_CARD }, props: { title: null, seed: SITE_CARD } },
    ...essays.map((essay) => ({
      params: { card: writingCard(writingSlug(essay)) },
      props: { title: essay.data.title, seed: writingSlug(essay) },
    })),
  ];
}

export const GET: APIRoute = ({ props }) => {
  const png = renderCard({
    title: props.title as string | null,
    name: siteConfig.displayName,
    seed: props.seed as string,
  });
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png" },
  });
};
