import { confirm } from "./confirm";
import { subscribe } from "./subscribe";
import { unsubscribe, unsubscribePage } from "./unsubscribe";
import { webhook } from "./webhook";
import type { NewsletterEnv } from "./storage";

/** Called exclusively through the named, private service-binding entrypoint. */
export async function handleNewsletterRequest(
  request: Request,
  env: NewsletterEnv,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  let response: Response;
  try {
    if (
      (path === "/api/subscribe" || path === "/api/newsletter/subscribe") &&
      request.method === "POST"
    ) {
      response = await subscribe(request, env);
    } else if (path === "/api/newsletter/confirm" && request.method === "GET") {
      response = await confirm(request, env);
    } else if (
      path === "/api/newsletter/unsubscribe" &&
      request.method === "GET"
    ) {
      response = await unsubscribePage(request);
    } else if (
      path === "/api/newsletter/unsubscribe" &&
      request.method === "POST"
    ) {
      response = await unsubscribe(request, env);
    } else if (
      path === "/api/newsletter/webhooks/resend" &&
      request.method === "POST"
    ) {
      response = await webhook(request, env);
    } else {
      response = new Response("Not found", { status: 404 });
    }
  } catch {
    response = Response.json(
      { error: "newsletter unavailable" },
      { status: 500 },
    );
  }
  response.headers.set("cache-control", "no-store");
  return response;
}
