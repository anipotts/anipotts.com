import { publicSearchIndex, publicContentContext } from "../../lib/content";
import type { APIRoute } from "astro";
const json = (data: unknown, status = 200) => Response.json(data, { status });

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  if (!q) return json({ results: [] });

  try {
    const items = await publicSearchIndex(publicContentContext(locals));
    const results = items.filter((item) => item.text.includes(q)).slice(0, 20);

    return json({
      results: results.map(({ text: _text, ...item }) => item),
    });
  } catch (error) {
    console.error("Public search unavailable");
    return json({ error: "Search unavailable" }, 503);
  }
};
