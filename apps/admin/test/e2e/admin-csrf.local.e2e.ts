import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// Local synthetic diagnostic and regression. The empty mutation body cannot
// create or update a draft: valid CSRF reaches the invalid_revision response.
// Tokens remain inside the browser/request and are never printed or asserted.
test("local owner CSRF cookie accompanies a same-origin mutation", async ({
  app,
  browser,
}) => {
  await app.open("/content/new");
  const result = await browser.evaluate(async () => {
    if (
      location.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(location.hostname)
    )
      throw new Error("Local CSRF diagnostic only");
    const issued = await fetch("/api/editorial/csrf", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const { csrf } = (await issued.json()) as { csrf?: unknown };
    if (!issued.ok || typeof csrf !== "string")
      throw new Error("Local CSRF issuance unavailable");
    const response = await fetch(
      "/api/editorial/save?kind=writing&id=synthetic-csrf-diagnostic",
      {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Editorial-CSRF": csrf,
        },
        body: "{}",
      },
    );
    const body = (await response.json()) as { error?: unknown };
    const error =
      typeof body.error === "string" &&
      ["csrf_required", "origin_required", "invalid_revision"].includes(
        body.error,
      )
        ? body.error
        : "other";
    return { status: response.status, error };
  });
  const cookiePresent = (await browser.cookies()).some((cookie) =>
    ["__Host-editorial-csrf", "editorial-local-owner-csrf"].includes(
      cookie.name,
    ),
  );
  // Sanitized diagnostic: cookie presence and fixed error codes only.
  console.log("local CSRF diagnostic", { cookiePresent, ...result });
  expect({ cookiePresent, ...result }).toEqual({
    cookiePresent: true,
    status: 400,
    error: "invalid_revision",
  });
});
