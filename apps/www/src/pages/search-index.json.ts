import type { APIRoute } from "astro";
import { publicSearchIndex, publicContentContext } from "../lib/content";
export const prerender = false;
/** Search and the public index share the same active publications. */
export const GET: APIRoute = async ({ locals }) =>
  Response.json(await publicSearchIndex(publicContentContext(locals)), {
    headers: { "Cache-Control": "no-store" },
  });
