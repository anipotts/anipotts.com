import { afterEach, describe, expect, it, vi } from "vitest";
import type { APIContext, AstroIntegration } from "astro";
import { ALL } from "./retired-route";
import { RETIRED_ROUTE_REDIRECTS } from "./retired-routes.mjs";
import config from "../../astro.config.mjs";
import { checkEditorialMutation } from "./editorial-security";

const answer = (path: string, method = "GET") =>
  ALL({
    url: new URL(path, "https://admin.anipotts.com"),
    request: new Request(new URL(path, "https://admin.anipotts.com"), {
      method,
    }),
  } as APIContext) as Response;

describe("retired routes", () => {
  it.each(Object.entries(RETIRED_ROUTE_REDIRECTS))(
    "%s answers 308 to %s for every method",
    (from, destination) => {
      for (const method of ["GET", "HEAD", "POST"]) {
        const response = answer(from, method);
        expect(response.status).toBe(308);
        expect(response.headers.get("Location")).toBe(destination);
      }
    },
  );

  it("sends each retired URL to a current workspace page", () => {
    for (const destination of Object.values(RETIRED_ROUTE_REDIRECTS))
      expect(destination).toMatch(
        /^\/(?:$|content\/pages$|data\/records$|observability\/(?:status|activity)$)/,
      );
  });

  it("are each injected into the router by the app's own Astro config", async () => {
    const integration = (config.integrations ?? [])
      .flat()
      .find(
        (item): item is AstroIntegration =>
          Boolean(item) &&
          (item as AstroIntegration).name === "admin-retired-routes",
      );
    expect(integration).toBeDefined();
    const injected: Array<{ pattern: string; entrypoint: string | URL }> = [];
    const setup = integration!.hooks[
      "astro:config:setup"
    ] as unknown as (options: {
      injectRoute: (route: (typeof injected)[number]) => void;
    }) => void;
    setup({ injectRoute: (route) => injected.push(route) });
    expect(injected.map((route) => route.pattern).sort()).toEqual(
      Object.keys(RETIRED_ROUTE_REDIRECTS).sort(),
    );
    for (const route of injected)
      expect(String(route.entrypoint)).toMatch(/\/retired-route\.ts$/);
  });
});

describe("isolated owner test toolbar", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([
    ["ordinary development", undefined, undefined, true],
    ["state without the local owner", undefined, "/tmp/synthetic-e2e", true],
    ["durable owner preview", "1", undefined, true],
    ["isolated owner e2e server", "1", "/tmp/synthetic-e2e", false],
  ] as const)(
    "%s preserves the supported toolbar boundary",
    async (_, owner, state, enabled) => {
      vi.stubEnv("ADMIN_LOCAL_OWNER", owner);
      vi.stubEnv("ADMIN_E2E_STATE_DIR", state);
      vi.stubEnv("GITHUB_ACTIONS", undefined);
      vi.resetModules();
      const { default: actual } = await import("../../astro.config.mjs");
      expect(actual.devToolbar?.enabled).toBe(enabled);
      expect(
        actual.vite?.plugins
          ?.flat()
          .some(
            (plugin) =>
              plugin &&
              "name" in plugin &&
              plugin.name === "isolated-owner-preview-assets",
          ),
      ).toBe(!enabled);
    },
  );
});

describe("isolated opaque preview assets", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  async function middleware() {
    vi.stubEnv("ADMIN_LOCAL_OWNER", "1");
    vi.stubEnv("ADMIN_E2E_STATE_DIR", "/tmp/synthetic-e2e");
    vi.stubEnv("GITHUB_ACTIONS", undefined);
    vi.resetModules();
    const { default: actual } = await import("../../astro.config.mjs");
    const plugin = actual.vite?.plugins
      ?.flat()
      .find(
        (plugin) =>
          plugin &&
          "name" in plugin &&
          plugin.name === "isolated-owner-preview-assets",
      ) as unknown as {
      configureServer(server: {
        middlewares: {
          use(
            callback: (
              request: {
                method: string;
                url: string;
                headers: Record<string, string>;
              },
              response: {
                getHeader(name: string): string | undefined;
                setHeader(name: string, value: string): void;
              },
              next: () => void,
            ) => void,
          ): void;
        };
      }): void;
    };
    let callback:
      | Parameters<
          Parameters<typeof plugin.configureServer>[0]["middlewares"]["use"]
        >[0]
      | undefined;
    plugin.configureServer({
      middlewares: {
        use(value) {
          callback = value;
        },
      },
    });
    if (!callback) throw new Error("Expected real Vite middleware");
    return (
      url: string,
      method = "GET",
      extraHeaders: Record<string, string> = {},
    ) => {
      const headers = new Map([["Vary", "Accept-Encoding"]]);
      let nextCalls = 0;
      callback!(
        {
          method,
          url,
          headers: { host: "127.0.0.1:8917", origin: "null", ...extraHeaders },
        },
        {
          getHeader: (name) => headers.get(name),
          setHeader: (name, value) => {
            headers.set(name, value);
          },
        },
        () => {
          nextCalls++;
        },
      );
      return { headers, nextCalls };
    };
  }
  const root = new URL("../../../..", import.meta.url).pathname.replace(
    /\/$/,
    "",
  );
  const modulePath = `/@fs${root}/apps/www/src/components/WorkDetail.astro?astro&type=style&index=0&lang.css`;

  it("adds only exact null-origin read permission to public preview modules/fonts and delegates serving", async () => {
    const run = await middleware();
    for (const url of [
      modulePath,
      `${root}/apps/www/src/components/Nav.astro?astro&type=script&index=0&lang.ts`,
      `/@fs${root}/apps/www/src/styles/global.css`,
      `/@fs${root}/packages/brand/src/BrandMark.astro?astro&type=style&index=0&lang.css`,
      `/@fs${root}/packages/brand/ap-structural-v0.2.0-candidate.1/fonts/APStructuralDisplayBlack-v0.2.0-candidate.1.woff2`,
      `/@fs${root}/node_modules/.pnpm/@fontsource-variable+jetbrains-mono@5.2.8/node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2`,
      "/@vite/client",
      "/node_modules/.vite/editorial-preview/deps/chunk-example.js?v=synthetic",
    ]) {
      for (const method of ["GET", "HEAD"]) {
        const result = run(url, method);
        expect(result.headers.get("Access-Control-Allow-Origin"), url).toBe(
          "null",
        );
        expect(result.headers.get("Vary")).toBe("Accept-Encoding, Origin");
        expect(result.headers.has("Access-Control-Allow-Credentials")).toBe(
          false,
        );
        expect(result.nextCalls).toBe(1);
      }
    }
  });

  it("does not grant CORS to writes, private/document paths, foreign hosts/origins or arbitrary filesystem inputs", async () => {
    const run = await middleware();
    for (const path of [
      "/api/editorial/record",
      `/@fs${root}/apps/www/src/pages/api/health.ts`,
      `/@fs${root}/apps/www/src/middleware.ts`,
      `/@fs${root}/apps/www/src/pages/preview.ts`,
      `/@fs${root}/apps/www/src/lib/content.ts`,
      "/api/editorial/media",
      "/content/new",
      "/auth",
      "/preview/record",
      `/@fs${root}/apps/admin/src/components/astryx/HomeEditor.tsx`,
      `/@fs${root}/apps/www/src/components/WorkDetail.astro`,
      `/@fs${root}/apps/www/src/components/WorkDetail.astro?raw`,
      `/@fs${root}/apps/www/src/components/%2e%2e/%2e%2e/private.js`,
      "/@fs/etc/passwd",
      "/node_modules/.vite/editorial-preview/ssr/private.js",
      "/unknown.js",
    ]) {
      const result = run(path, "GET", { "sec-fetch-dest": "script" });
      expect(result.headers.has("Access-Control-Allow-Origin"), path).toBe(
        false,
      );
      expect(result.nextCalls).toBe(1);
    }
    for (const invalid of [
      `http://user@127.0.0.1:8917${modulePath}`,
      `${modulePath}#fragment`,
      `https://127.0.0.1:8917${modulePath}`,
    ])
      expect(run(invalid).headers.has("Access-Control-Allow-Origin")).toBe(
        false,
      );
    for (const method of ["POST", "PUT", "DELETE", "OPTIONS"])
      expect(
        run(modulePath, method).headers.has("Access-Control-Allow-Origin"),
      ).toBe(false);
    for (const headers of [
      { origin: "https://example.test" },
      { origin: "http://127.0.0.1:8917" },
      { host: "remote.example:8917" },
      { forwarded: "host=remote.example" },
      { "x-forwarded-host": "remote.example" },
    ] as Array<Record<string, string>>)
      expect(
        run(modulePath, "GET", headers).headers.has(
          "Access-Control-Allow-Origin",
        ),
      ).toBe(false);
  });
});

it("opaque asset permission never changes null-origin mutation rejection", () => {
  const base = "http://127.0.0.1:8917";
  const response = checkEditorialMutation(
    new Request(`${base}/api/editorial/save`, {
      method: "POST",
      headers: {
        Origin: "null",
        "Sec-Fetch-Site": "cross-site",
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
    base,
  );
  expect(response).toBe("origin_required");
});
