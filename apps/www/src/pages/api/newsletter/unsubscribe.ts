import type { APIRoute } from "astro";
import { siteConfig } from "@anipotts/content/public";
import {
  html,
  missingDbResponse,
  unsubscribeByToken,
} from "../../../lib/newsletter";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  return html(render(token));
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (!env.DB) return missingDbResponse();

  const url = new URL(request.url);
  let token = url.searchParams.get("token") ?? "";
  if (!token) {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => ({}))) as {
        token?: string;
      };
      token = body.token ?? "";
    } else {
      const body = await request.text();
      token = new URLSearchParams(body).get("token") ?? "";
    }
  }

  if (token) await unsubscribeByToken(env.DB, token);
  return new Response(null, { status: 200 });
};

function render(token: string): string {
  const hidden = token
    ? `<input type="hidden" name="token" value="${escapeAttr(token)}">`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>unsubscribe / ${siteConfig.displayName} newsletter</title><style>body{margin:0;background:#fbfaf7;color:#171717;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:42rem;margin:12vh auto;padding:0 1.25rem}h1{font-size:clamp(2rem,8vw,4rem);font-weight:520;line-height:.98;margin:0 0 1rem}p{font-size:1.05rem;line-height:1.55;color:#555}button{min-height:44px;padding:0 1rem;border:1px solid #171717;background:#171717;color:#fff;border-radius:6px}</style></head><body><main><h1>unsubscribe</h1><p>this stops future newsletter emails from ani.</p><form method="post">${hidden}<button type="submit">unsubscribe</button></form></main></body></html>`;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
