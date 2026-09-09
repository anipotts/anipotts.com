import type { APIRoute } from "astro";
const json = (data: unknown, status = 200) => Response.json(data, { status });

export const prerender = false;

type SearchItem = {
  slug: string;
  title: string;
  summary: string;
  date: string | null;
  text: string;
};

/** Search the build's published-content artifact without loading Markdown at runtime. */
export const GET: APIRoute = async ({ url, locals }) => {
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  if (!q) return json({ results: [] });

  try {
    const indexUrl = new URL("/search-index.json", url);
    const response = import.meta.env.DEV
      ? await fetch(indexUrl)
      : await locals.runtime.env.ASSETS.fetch(new Request(indexUrl));
    if (!response.ok) throw new Error("Published search index unavailable");
    const items = (await response.json()) as SearchItem[];
    const results = items.filter((item) => item.text.includes(q)).slice(0, 20);

    return json({
      results: results.map(({ text: _text, ...item }) => item),
    });
  } catch (error) {
    console.error("search api error", error);
    return json({ error: "Search unavailable" }, 503);
  }
};
