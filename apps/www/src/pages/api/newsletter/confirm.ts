import type { APIRoute } from "astro";
import { siteConfig } from "@anipotts/content/public";
import {
  confirmSubscriber,
  html,
  missingDbResponse,
} from "../../../lib/newsletter";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (!env.DB) return missingDbResponse();

  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!token) {
    return html(
      render("missing token", "that confirmation link is incomplete."),
      400,
    );
  }

  const result = await confirmSubscriber(env.DB, token);
  if (result === "confirmed") {
    return html(
      render(
        "confirmed",
        "you are on the list. future issues will come from ani's first-party newsletter system.",
      ),
    );
  }
  if (result === "expired") {
    return html(
      render("expired", "that confirmation link expired. subscribe again."),
      400,
    );
  }
  if (result === "used") {
    return html(
      render("already used", "that confirmation link was already used."),
    );
  }
  return html(render("invalid", "that confirmation link is not valid."), 400);
};

function render(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} / ${siteConfig.displayName} newsletter</title><style>body{margin:0;background:#fbfaf7;color:#171717;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:42rem;margin:12vh auto;padding:0 1.25rem}h1{font-size:clamp(2rem,8vw,4rem);font-weight:520;line-height:.98;margin:0 0 1rem}p{font-size:1.05rem;line-height:1.55;color:#555}a{color:inherit}</style></head><body><main><h1>${title}</h1><p>${body}</p><p><a href="/">back to the newsletter</a></p></main></body></html>`;
}
