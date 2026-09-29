import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
const fixture = vi.hoisted(() => ({
  config: {} as Record<string, string>,
  jwks: {} as unknown,
}));
vi.mock("./runtime-env", () => ({ runtimeEnv: () => fixture.config }));
vi.mock("astro:middleware", () => ({
  defineMiddleware: (handler: unknown) => handler,
}));
vi.mock("./editorial-content", () => ({
  publicSiteUrl: "https://fixture.example",
}));
vi.mock("./editorial-media", () => ({
  editorialImagePreview: (path: string) => path,
}));
vi.mock("jose", async (original) => {
  const real = await original<typeof import("jose")>();
  return {
    ...real,
    createRemoteJWKSet: (url: URL) =>
      real.createRemoteJWKSet(url, {
        [real.customFetch]: async () => Response.json(fixture.jwks),
      }),
  };
});
import { onRequest } from "../middleware";
import { standalonePreviewFrameUrl } from "./preview-html";
import { previewFailure } from "./preview-status";

const origin = "https://admin.anipotts.com";
const policy =
  "sandbox allow-scripts; form-action 'none'; frame-ancestors 'self'; connect-src 'none'";
let signing: CryptoKey;
beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  signing = pair.privateKey;
  fixture.jwks = {
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: "preview" }],
  };
  fixture.config = {
    ACCESS_TEAM_DOMAIN: "https://preview.cloudflareaccess.com",
    ACCESS_POLICY_AUD: "preview-audience",
  };
});
beforeEach(() => {
  vi.stubGlobal("__LOCAL_OWNER_BUILD__", false);
  vi.stubEnv("DEV", false);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function token(email = "hello@anipotts.com") {
  return new SignJWT({ email, type: "app" })
    .setProtectedHeader({ alg: "RS256", kid: "preview" })
    .setIssuer(fixture.config.ACCESS_TEAM_DOMAIN!)
    .setAudience(fixture.config.ACCESS_POLICY_AUD!)
    .setSubject("synthetic-preview-owner")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signing);
}
async function dispatch(
  path: string,
  headers: Record<string, string> = {},
  failure = false,
) {
  const rendered: string[] = [];
  const rewrites: URL[] = [];
  async function route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const context = {
      url,
      request,
      locals: {},
      redirect: (location: string, status: number) =>
        new Response(null, { status, headers: { location } }),
      rewrite: async (target: URL) => {
        rewrites.push(target);
        return route(new Request(target, request));
      },
    };
    return onRequest(context as never, async () => {
      rendered.push(url.pathname);
      if (url.pathname === "/preview/standalone") {
        const frame = standalonePreviewFrameUrl(url);
        return frame
          ? new Response(
              `<iframe src="${frame.pathname}${frame.search}"></iframe>`,
              { headers: { "Content-Type": "text/html" } },
            )
          : Response.json({ error: "invalid_preview" }, { status: 400 });
      }
      return failure
        ? previewFailure(url, "stale", 409)
        : new Response(
            '<html><body>Synthetic private draft<a href="/writing">read</a></body></html>',
            { headers: { "Content-Type": "text/html" } },
          );
    }) as Promise<Response>;
  }
  const response = await route(new Request(origin + path, { headers }));
  return { response, rendered, rewrites };
}
it.each([
  "/preview/home?revision=7",
  "/preview/record?kind=writing&id=synthetic&revision=7",
])("wraps owner top-level %s before any private render", async (path) => {
  const { response, rendered, rewrites } = await dispatch(path, {
    "cf-access-jwt-assertion": await token(),
    "sec-fetch-dest": "document",
  });
  expect(rendered).toEqual(["/preview/standalone"]);
  expect(rewrites).toHaveLength(1);
  expect(response.headers.get("Content-Security-Policy")).toBeNull();
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  const frame = standalonePreviewFrameUrl(rewrites[0]!)!;
  expect(frame.pathname).toBe(new URL(origin + path).pathname);
  expect(frame.searchParams.get("revision")).toBe("7");
  expect(frame.searchParams.get("embedded")).toBe("1");
  expect(await response.text()).not.toContain("Synthetic private draft");
});
const navigationHeaders: Record<string, string>[] = [
  {},
  { "sec-fetch-dest": "document" },
  { "sec-fetch-dest": "empty", "x-forwarded-sec-fetch-dest": "iframe" },
];
it.each(navigationHeaders)(
  "raw-mode query cannot replace browser iframe metadata %j",
  async (headers) => {
    const result = await dispatch("/preview/home?revision=1&embedded=1", {
      ...headers,
      "cf-access-jwt-assertion": await token(),
    });
    expect(result.rendered).toEqual(["/preview/standalone"]);
  },
);
it("iframe metadata alone does not opt into raw rendering", async () => {
  const result = await dispatch("/preview/home?revision=1", {
    "sec-fetch-dest": "iframe",
    "cf-access-jwt-assertion": await token(),
  });
  expect(result.rendered).toEqual(["/preview/standalone"]);
});
it("explicit embedded mode preserves the opaque sandbox and draft failure handshake", async () => {
  const headers = {
    "sec-fetch-dest": "iframe",
    "cf-access-jwt-assertion": await token(),
  };
  for (const failure of [false, true]) {
    const result = await dispatch(
      "/preview/record?kind=writing&id=synthetic&revision=7&embedded=1&previewRequest=exact",
      headers,
      failure,
    );
    expect(result.rendered).toEqual(["/preview/record"]);
    expect(result.rewrites).toHaveLength(0);
    expect(result.response.status).toBe(failure ? 409 : 200);
    expect(result.response.headers.get("Content-Security-Policy")).toBe(policy);
    const html = await result.response.text();
    expect(html).toContain(
      failure ? '"status":"stale"' : "Synthetic private draft",
    );
    if (failure) expect(html).toContain('"request":"exact"');
    else expect(html).toContain('href="https://fixture.example/writing"');
  }
});
it.each([
  "/preview/home?embedded=1",
  "/preview/standalone?previewPath=%2Fpreview%2Fhome",
])("keeps exact signed owner authority for %s", async (path) => {
  for (const assertion of [undefined, await token("wrong@example.test")]) {
    const headers: Record<string, string> = {
      "sec-fetch-dest": "iframe",
      "cf-access-authenticated-user-email": "hello@anipotts.com",
    };
    if (assertion) headers["cf-access-jwt-assertion"] = assertion;
    const result = await dispatch(path, headers);
    expect(result.response.status).toBe(302);
    expect(result.rendered).toEqual([]);
    expect(result.rewrites).toEqual([]);
  }
});
it.each([
  "https://other.example/preview/home",
  "//other.example/preview/home",
  "/content/writing/private",
  "/preview/standalone",
  "/preview/home/extra",
  "",
])("rejects an invalid standalone frame path %s", async (path) => {
  const result = await dispatch(
    `/preview/standalone?previewPath=${encodeURIComponent(path)}`,
    { "cf-access-jwt-assertion": await token() },
  );
  expect(result.response.status).toBe(400);
  expect(result.rewrites).toHaveLength(0);
});
