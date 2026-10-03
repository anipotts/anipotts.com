import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { env as workerEnv } from "cloudflare:workers";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import worker from "../../dist/server/entry.mjs";

afterEach(() => {
  vi.unstubAllGlobals();
  delete workerEnv.ACCESS_TEAM_DOMAIN;
  delete workerEnv.ACCESS_POLICY_AUD;
});

function assertInlineScriptsAndStylesAllowed(response, html) {
  const policy = response.headers.get("Content-Security-Policy") ?? "";
  const directives = policy.split(";").map((part) => part.trim());
  const stylePolicy =
    directives.find((part) => part.startsWith("style-src ")) ?? "";
  expect(stylePolicy).toBe("style-src 'self' 'unsafe-inline'");
  expect(directives.some((part) => part.startsWith("style-src-elem "))).toBe(
    false,
  );
  expect(directives.some((part) => part.startsWith("style-src-attr "))).toBe(
    false,
  );
  const defaultScriptPolicy =
    directives.find((part) => part.startsWith("script-src ")) ?? "";
  const scriptPolicy =
    directives.find((part) => part.startsWith("script-src-elem ")) ??
    defaultScriptPolicy;
  expect(defaultScriptPolicy).toContain("script-src 'self'");
  expect(scriptPolicy).not.toContain("'unsafe-inline'");
  const scripts = [
    ...new JSDOM(html).window.document.querySelectorAll("script"),
  ];
  const blocked = [];
  for (const script of scripts) {
    if (script.src || !script.textContent) continue;
    const hash = createHash("sha256")
      .update(script.textContent)
      .digest("base64");
    const nonce = script.getAttribute("nonce");
    if (!(
      scriptPolicy.includes(`'sha256-${hash}'`) ||
      (nonce && scriptPolicy.includes(`'nonce-${nonce}'`))
    ))
      blocked.push({
        text: script.textContent.slice(0, 100),
        length: script.textContent.length,
        hash,
      });
  }
  expect(blocked).toEqual([]);
  expect(scripts.length).toBeGreaterThan(0);
}

it("renders the built public auth document with CSP and a fresh nonce", async () => {
  const response = await worker.fetch(
    new Request("https://admin.anipotts.com/auth"),
    {
      ACCESS_TEAM_DOMAIN: "https://synthetic.cloudflareaccess.com",
      ACCESS_POLICY_AUD: "a".repeat(64),
      ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    },
    { waitUntil() {} },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  assertInlineScriptsAndStylesAllowed(response, await response.text());
  const another = await worker.fetch(
    new Request("https://admin.anipotts.com/auth"),
    {
      ACCESS_TEAM_DOMAIN: "https://synthetic.cloudflareaccess.com",
      ACCESS_POLICY_AUD: "a".repeat(64),
      ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    },
    { waitUntil() {} },
  );
  const firstNonce = response.headers
    .get("Content-Security-Policy")
    ?.match(/'nonce-([^']+)'/u)?.[1];
  const nextNonce = another.headers
    .get("Content-Security-Policy")
    ?.match(/'nonce-([^']+)'/u)?.[1];
  expect(firstNonce).toBeTruthy();
  expect(nextNonce).toBeTruthy();
  expect(nextNonce).not.toBe(firstNonce);
});

it("keeps every inline script permitted on built admin documents", async () => {
  const issuer = "https://synthetic.cloudflareaccess.com";
  const audience = "a".repeat(64);
  const pair = await generateKeyPair("RS256");
  const jwks = {
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: "synthetic" }],
  };
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    iss: issuer,
    aud: audience,
    email: "hello@anipotts.com",
    sub: "synthetic-owner",
    type: "app",
    iat: now,
    exp: now + 60,
  })
    .setProtectedHeader({ alg: "RS256", kid: "synthetic" })
    .sign(pair.privateKey);
  const fetchKeys = vi.fn(async (url) => {
    expect(String(url)).toBe(`${issuer}/cdn-cgi/access/certs`);
    return Response.json(jwks);
  });
  vi.stubGlobal("fetch", fetchKeys);
  Object.assign(workerEnv, {
    ACCESS_TEAM_DOMAIN: issuer,
    ACCESS_POLICY_AUD: audience,
  });
  for (const path of [
    "/data/records",
    "/data/sources",
    "/data/health",
    "/data/knowledge",
    "/observability/status",
    "/observability/activity",
    "/observability/alerts",
    "/content/pages",
    "/content/writing",
    "/content/projects",
    "/content/newsletter",
    "/content/home/home",
  ]) {
    const response = await worker.fetch(
      new Request(`https://admin.anipotts.com${path}`, {
        headers: {
          "cf-access-jwt-assertion": token,
          "cf-access-authenticated-user-email": "hello@anipotts.com",
        },
      }),
      {
        ACCESS_TEAM_DOMAIN: issuer,
        ACCESS_POLICY_AUD: audience,
        ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
      },
      { waitUntil() {} },
    );
    expect(
      response.status,
      `${path}: ${response.headers.get("location")} fetches=${fetchKeys.mock.calls.length}`,
    ).toBe(200);
    assertInlineScriptsAndStylesAllowed(response, await response.text());
  }
  expect(fetchKeys).toHaveBeenCalled();
  const preview = await worker.fetch(
    new Request("https://admin.anipotts.com/preview/home?embedded=1", {
      headers: {
        "cf-access-jwt-assertion": token,
        "cf-access-authenticated-user-email": "hello@anipotts.com",
        "sec-fetch-dest": "iframe",
      },
    }),
    {
      ACCESS_TEAM_DOMAIN: issuer,
      ACCESS_POLICY_AUD: audience,
      ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    },
    { waitUntil() {} },
  );
  expect(preview.status).toBe(409);
  expect(preview.headers.get("Content-Security-Policy")).toBe(
    "sandbox allow-scripts; form-action 'none'; frame-ancestors 'self'; connect-src 'none'",
  );
});

it.skipIf(process.env.RUN_CSP_BROWSER !== "1")(
  "runs the built auth bootstrap and editorial hydration in an isolated browser",
  async () => {
    const response = await worker.fetch(
      new Request("https://admin.anipotts.com/auth", {
        headers: { cookie: "ap-theme=dark" },
      }),
      {
        ACCESS_TEAM_DOMAIN: "https://synthetic.cloudflareaccess.com",
        ACCESS_POLICY_AUD: "a".repeat(64),
        ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
      },
      { waitUntil() {} },
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    const issuer = "https://synthetic-browser.cloudflareaccess.com";
    const audience = "b".repeat(64);
    const pair = await generateKeyPair("RS256");
    const jwks = {
      keys: [{ ...(await exportJWK(pair.publicKey)), kid: "browser" }],
    };
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      iss: issuer,
      aud: audience,
      email: "hello@anipotts.com",
      sub: "synthetic-browser-owner",
      type: "app",
      iat: now,
      exp: now + 60,
    })
      .setProtectedHeader({ alg: "RS256", kid: "browser" })
      .sign(pair.privateKey);
    vi.stubGlobal("fetch", async (url) => {
      expect(String(url)).toBe(`${issuer}/cdn-cgi/access/certs`);
      return Response.json(jwks);
    });
    Object.assign(workerEnv, {
      ACCESS_TEAM_DOMAIN: issuer,
      ACCESS_POLICY_AUD: audience,
    });
    const editorial = await worker.fetch(
      new Request("https://admin.anipotts.com/content/writing", {
        headers: {
          "cf-access-jwt-assertion": token,
          "cf-access-authenticated-user-email": "hello@anipotts.com",
        },
      }),
      {
        ACCESS_TEAM_DOMAIN: issuer,
        ACCESS_POLICY_AUD: audience,
        ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
      },
      { waitUntil() {} },
    );
    expect(editorial.status).toBe(200);
    const editorialHtml = await editorial.text();
    const home = await worker.fetch(
      new Request("https://admin.anipotts.com/content/home/home", {
        headers: {
          "cf-access-jwt-assertion": token,
          "cf-access-authenticated-user-email": "hello@anipotts.com",
        },
      }),
      {
        ACCESS_TEAM_DOMAIN: issuer,
        ACCESS_POLICY_AUD: audience,
        ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
      },
      { waitUntil() {} },
    );
    expect(home.status).toBe(200);
    const homeHtml = await home.text();
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ serviceWorkers: "block" });
      await context.addCookies([
        {
          name: "ap-theme",
          value: "dark",
          domain: "admin.anipotts.com",
          path: "/",
        },
      ]);
      const page = await context.newPage();
      const violations = [];
      page.on("console", (message) => {
        if (message.text().includes("Content Security Policy"))
          violations.push(message.text());
      });
      page.on("pageerror", (error) => violations.push(error.message));
      const assetRoot = resolve(
        fileURLToPath(new URL("../../dist/client/", import.meta.url)),
      );
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== "https://admin.anipotts.com") return route.abort();
        const document =
          url.pathname === "/auth"
            ? { response, html }
            : url.pathname === "/content/writing"
              ? { response: editorial, html: editorialHtml }
              : url.pathname === "/content/home/home"
                ? { response: home, html: homeHtml }
                : null;
        if (document)
          return route.fulfill({
            status: 200,
            headers: Object.fromEntries(document.response.headers),
            body: document.html,
          });
        const path = resolve(assetRoot, `.${url.pathname}`);
        if (!path.startsWith(`${assetRoot}/`)) return route.abort();
        try {
          const body = await readFile(path);
          const type = path.endsWith(".css")
            ? "text/css"
            : path.endsWith(".js")
              ? "text/javascript"
              : path.endsWith(".woff2")
                ? "font/woff2"
                : path.endsWith(".svg")
                  ? "image/svg+xml"
                  : "application/octet-stream";
          return route.fulfill({ status: 200, contentType: type, body });
        } catch {
          return route.fulfill({ status: 404, body: "" });
        }
      });
      await page.goto("https://admin.anipotts.com/auth", {
        waitUntil: "networkidle",
      });
      expect(await page.locator("html").getAttribute("data-theme")).toBe(
        "dark",
      );
      await page.goto("https://admin.anipotts.com/content/writing", {
        waitUntil: "networkidle",
      });
      await page.waitForFunction(() =>
        [...document.querySelectorAll("astro-island")].some(
          (island) => !island.hasAttribute("ssr"),
        ),
      );
      const inlineStyles = await page.evaluate(() => {
        const attribute = document.createElement("div");
        attribute.setAttribute("style", "color: rgb(1, 2, 3)");
        document.body.append(attribute);
        const attributeColor = getComputedStyle(attribute).color;
        attribute.remove();

        const element = document.createElement("style");
        element.textContent = ".csp-inline-probe { color: rgb(4, 5, 6) }";
        document.head.append(element);
        const target = document.createElement("div");
        target.className = "csp-inline-probe";
        document.body.append(target);
        const elementColor = getComputedStyle(target).color;
        target.remove();
        element.remove();
        return { attributeColor, elementColor };
      });
      expect(inlineStyles).toEqual({
        attributeColor: "rgb(1, 2, 3)",
        elementColor: "rgb(4, 5, 6)",
      });
      await page.goto("https://admin.anipotts.com/content/home/home", {
        waitUntil: "networkidle",
      });
      await page.waitForFunction(() =>
        [...document.querySelectorAll("astro-island")].some(
          (island) => !island.hasAttribute("ssr"),
        ),
      );
      expect(violations).toEqual([]);
    } finally {
      await browser.close();
    }
  },
);
