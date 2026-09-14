import type { APIRoute } from "astro";
import { siteConfig } from "@anipotts/content/public";
import { readBoundedText } from "../../../lib/api";
import {
  confirmSubscriber,
  html,
  isTokenShaped,
  missingDbResponse,
  TOKEN_BODY_LIMIT_BYTES,
} from "../../../lib/newsletter";

export const prerender = false;

// Mail scanners and link previews fetch GET links, so GET only renders the
// form and POST confirms, the same split unsubscribe uses.
export const GET: APIRoute = async ({ request }) => {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!token) return missingToken();
  if (!isTokenShaped(token)) return invalidToken();
  return html(renderForm(token));
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (!env.DB) return missingDbResponse();

  let token = new URL(request.url).searchParams.get("token") ?? "";
  if (!token) {
    const body = await readBoundedText(request, TOKEN_BODY_LIMIT_BYTES);
    token = body === null ? "" : (new URLSearchParams(body).get("token") ?? "");
  }
  if (!token) return missingToken();
  if (!isTokenShaped(token)) return invalidToken();

  const result = await confirmSubscriber(env.DB, token);
  if (result === "confirmed") {
    return html(
      render(
        "confirmed",
        "you are on the list. future issues will come from ani's first-party newsletter system.",
      ),
    );
  }
  if (result === "suppressed") {
    return html(
      render(
        "blocked",
        "that address is blocked from the newsletter after a delivery failure or complaint.",
      ),
      409,
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
  return invalidToken();
};

function missingToken(): Response {
  return html(
    render("missing token", "that confirmation link is incomplete."),
    400,
  );
}

function invalidToken(): Response {
  return html(render("invalid", "that confirmation link is not valid."), 400);
}

const STYLE = `body{margin:0;background:#fbfaf7;color:#171717;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:42rem;margin:12vh auto;padding:0 1.25rem}h1{font-size:clamp(2rem,8vw,4rem);font-weight:520;line-height:.98;margin:0 0 1rem}p{font-size:1.05rem;line-height:1.55;color:#555}a{color:inherit}button{min-height:44px;padding:0 1rem;border:1px solid #171717;background:#171717;color:#fff;border-radius:6px}`;

function page(title: string, content: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} / ${siteConfig.displayName} newsletter</title><style>${STYLE}</style></head><body><main><h1>${title}</h1>${content}</main></body></html>`;
}

function render(title: string, body: string): string {
  return page(
    title,
    `<p>${body}</p><p><a href="/">back to the newsletter</a></p>`,
  );
}

function renderForm(token: string): string {
  return page(
    "confirm",
    `<p>confirm your subscription to ani's newsletter.</p><form method="post"><input type="hidden" name="token" value="${escapeAttr(token)}"><button type="submit">confirm subscription</button></form>`,
  );
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
