import { describe, expect, test } from "vitest";
import {
  isDevLoopbackPreviewRequest,
  isLocalOwnerRequest,
  isPublicAdminPath,
} from "./admin-access-policy";

/** The order middleware applies the policy in, for requests outside the
 * editorial namespace. */
function decideAdminAccess({
  isDev,
  localOwner = false,
  method,
  url,
  headers = new Headers(),
  hasSession,
}: {
  isDev: boolean;
  localOwner?: boolean;
  method: string;
  url: URL;
  headers?: Headers;
  hasSession: boolean;
}) {
  if (isPublicAdminPath(url.pathname)) return "public";
  if (isLocalOwnerRequest({ enabled: localOwner, method, url, headers }))
    return "local-owner";
  if (isDevLoopbackPreviewRequest({ isDev, method, url }))
    return "dev-loopback-preview";
  return hasSession ? "session" : "passkey-required";
}

const local = (path: string, origin = "http://localhost:4311") =>
  new URL(path, origin);

describe("admin access policy", () => {
  test.each([
    "/auth",
    "/auth/invite",
    "/auth/passkey",
    "/auth/recover",
    "/api/admin/auth/session",
    "/api/admin/device/start",
    "/api/admin/device/status",
    "/api/admin/device/claim",
    "/api/admin/invites/status",
    "/api/admin/recovery/google/start",
    "/api/admin/password/status",
    "/api/admin/password/login",
    "/api/admin/password/logout",
    "/api/mcp",
  ])("keeps the signed-out auth boundary public for %s", (path) => {
    expect(isPublicAdminPath(path)).toBe(true);
  });

  test.each([
    "/auth/device/opaque-request",
    "/auth/recover/passkey",
    "/api/admin/device/approve",
    "/api/admin/device/review",
    "/api/admin/members/invite",
    "/api/admin/recovery/passkey/options",
  ])("keeps authenticated auth operations protected for %s", (path) => {
    expect(isPublicAdminPath(path)).toBe(false);
  });

  test.each([
    "/",
    "/inbox",
    "/work?view=now",
    "/content",
    "/knowledge",
    "/life",
    "/system",
    "/fleet",
    "/proof",
  ])("allows the read-only development preview for %s", (path) => {
    expect(
      isDevLoopbackPreviewRequest({
        isDev: true,
        method: "GET",
        url: local(path),
      }),
    ).toBe(true);
  });

  test("accepts the exact numeric loopback preview origin", () => {
    expect(
      isDevLoopbackPreviewRequest({
        isDev: true,
        method: "HEAD",
        url: local("/inbox", "http://127.0.0.1:4311"),
      }),
    ).toBe(true);
  });

  test.each([
    "http://localhost:4401",
    "http://127.0.0.1:4455",
    "http://[::1]:4401",
  ])("accepts a loopback dev server origin %s", (origin) => {
    expect(
      isDevLoopbackPreviewRequest({
        isDev: true,
        method: "GET",
        url: local("/inbox", origin),
      }),
    ).toBe(true);
  });

  test.each([
    "/@vite/client",
    "/@id/react",
    "/@react-refresh",
    "/src/components/astryx/AdminCommandPalette.tsx",
  ])("allows a read-only Vite development asset %s", (path) => {
    expect(
      isDevLoopbackPreviewRequest({
        isDev: true,
        method: "GET",
        url: local(path, "http://127.0.0.1:4401"),
      }),
    ).toBe(true);
  });

  test.each([
    {
      name: "production",
      isDev: false,
      method: "GET",
      url: local("/inbox"),
    },
    {
      name: "write method",
      isDev: true,
      method: "POST",
      url: local("/work"),
    },
    {
      name: "protected api",
      isDev: true,
      method: "GET",
      url: local("/api/admin/inbox"),
    },
    {
      name: "write to Vite path",
      isDev: true,
      method: "POST",
      url: local(
        "/src/components/astryx/AdminCommandPalette.tsx",
        "http://127.0.0.1:4401",
      ),
    },
    {
      name: "non-loopback host",
      isDev: true,
      method: "GET",
      url: local("/inbox", "https://admin.anipotts.com"),
    },
    {
      name: "unapproved auth operation",
      isDev: true,
      method: "GET",
      url: local("/auth/device/opaque-request"),
    },
    {
      name: "retired named localhost host",
      isDev: true,
      method: "GET",
      url: local("/inbox", "http://admin.anipotts.localhost:1355"),
    },
    {
      name: "lookalike loopback host",
      isDev: true,
      method: "GET",
      url: local("/inbox", "http://localhost.example:4401"),
    },
    {
      name: "loopback over https",
      isDev: true,
      method: "GET",
      url: local("/inbox", "https://localhost:4401"),
    },
    {
      name: "unapproved page",
      isDev: true,
      method: "GET",
      url: local("/content/editor/unsupported"),
    },
  ])("does not bypass native auth for $name", ({ isDev, method, url }) => {
    expect(
      isDevLoopbackPreviewRequest({
        isDev,
        method,
        url,
      }),
    ).toBe(false);
  });

  test("requires native auth for an unauthenticated production admin route", () => {
    expect(
      decideAdminAccess({
        isDev: false,
        method: "GET",
        url: new URL("https://admin.anipotts.com/inbox"),
        hasSession: false,
      }),
    ).toBe("passkey-required");
  });

  test("keeps authenticated production access intact", () => {
    expect(
      decideAdminAccess({
        isDev: false,
        method: "GET",
        url: new URL("https://admin.anipotts.com/work?view=now"),
        hasSession: true,
      }),
    ).toBe("session");
  });
});

test("observability preview allows only the local read surface, keeping its API and production protected", () => {
  expect(
    decideAdminAccess({
      isDev: true,
      method: "GET",
      url: local("/operations/observability"),
      hasSession: false,
    }),
  ).toBe("dev-loopback-preview");
  for (const input of [
    {
      isDev: false,
      method: "GET",
      url: new URL("https://admin.anipotts.com/operations/observability"),
    },
    { isDev: true, method: "GET", url: local("/api/admin/projections") },
    { isDev: true, method: "POST", url: local("/operations/observability") },
  ])
    expect(decideAdminAccess({ ...input, hasSession: false })).toBe(
      "passkey-required",
    );
});

test.each(["people", "projects", "places", "timeline", "sources", "preview"])(
  "keeps Life %s preview local and read-only",
  (section) => {
    const path = `/life/${section}`;
    expect(
      isDevLoopbackPreviewRequest({
        isDev: true,
        method: "GET",
        url: local(path),
      }),
    ).toBe(true);
    expect(
      isDevLoopbackPreviewRequest({
        isDev: false,
        method: "GET",
        url: local(path),
      }),
    ).toBe(false);
    expect(
      isDevLoopbackPreviewRequest({
        isDev: true,
        method: "POST",
        url: local(path),
      }),
    ).toBe(false);
    expect(
      isDevLoopbackPreviewRequest({
        isDev: true,
        method: "GET",
        url: new URL(path, "https://admin.anipotts.com"),
      }),
    ).toBe(false);
    expect(isPublicAdminPath(path)).toBe(false);
  },
);

test("exposes only the exact static Admin favicon path", () => {
  expect(isPublicAdminPath("/admin-bracket.svg")).toBe(true);
  for (const path of [
    "/admin-bracket.svg/extra",
    "/admin-bracket.svg.json",
    "/admin-bracket-other.svg",
  ]) {
    expect(isPublicAdminPath(path)).toBe(false);
  }
});

describe("local owner session", () => {
  const request = ({
    origin = "http://localhost:4321",
    path = "/api/admin/inbox",
    method = "POST",
    headers = {},
    localOwner = true,
    isDev = true,
    hasSession = false,
  }: {
    origin?: string;
    path?: string;
    method?: string;
    headers?: Record<string, string>;
    localOwner?: boolean;
    isDev?: boolean;
    hasSession?: boolean;
  } = {}) => {
    const url = new URL(path, origin);
    return {
      isDev,
      localOwner,
      method,
      url,
      headers: new Headers({ host: url.host, ...headers }),
      hasSession,
    };
  };

  test.each([
    "http://localhost:4321",
    "http://127.0.0.1:8787",
    "http://[::1]:3001",
    "http://127.0.0.1:4401",
  ])("grants every method on the loopback host %s", (origin) => {
    for (const method of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"])
      expect(decideAdminAccess(request({ origin, method }))).toBe(
        "local-owner",
      );
  });

  test("accepts loopback forwarding headers from a local tool", () => {
    expect(
      decideAdminAccess(
        request({
          origin: "http://127.0.0.1:4401",
          headers: {
            "x-forwarded-host": "127.0.0.1:4401",
            "x-forwarded-for": "::ffff:127.0.0.1",
            "x-forwarded-proto": "http",
            "x-forwarded-port": "4401",
          },
        }),
      ),
    ).toBe("local-owner");
  });

  test("grants a same-origin browser write and a production-build loopback read", () => {
    expect(
      decideAdminAccess(
        request({
          origin: "http://127.0.0.1:8787",
          path: "/api/editorial/save",
          headers: {
            origin: "http://127.0.0.1:8787",
            "sec-fetch-site": "same-origin",
            "cf-connecting-ip": "127.0.0.1",
          },
        }),
      ),
    ).toBe("local-owner");
    expect(
      decideAdminAccess(
        request({
          origin: "http://127.0.0.1:8787",
          path: "/content/writing/example",
          method: "GET",
          isDev: false,
        }),
      ),
    ).toBe("local-owner");
  });

  test("keeps behaviour unchanged when the build-time flag is off", () => {
    expect(
      decideAdminAccess(request({ localOwner: false, method: "POST" })),
    ).toBe("passkey-required");
    expect(
      decideAdminAccess(
        request({
          localOwner: false,
          origin: "http://localhost:4311",
          path: "/inbox",
          method: "GET",
        }),
      ),
    ).toBe("dev-loopback-preview");
    expect(
      decideAdminAccess(
        request({
          localOwner: false,
          origin: "https://admin.anipotts.com",
          path: "/inbox",
          method: "GET",
          isDev: false,
          hasSession: true,
        }),
      ),
    ).toBe("session");
    expect(
      isLocalOwnerRequest({
        enabled: false,
        method: "GET",
        url: new URL("http://localhost:4321/content"),
        headers: new Headers({ host: "localhost:4321" }),
      }),
    ).toBe(false);
  });

  test.each([
    "https://admin.anipotts.com",
    "http://example.com",
    "http://192.168.1.20:4321",
    "http://0.0.0.0:4321",
    "http://10.0.0.2:4311",
    "http://localhost.example.com:4321",
    "http://admin.anipotts.localhost.example:1355",
    "http://admin.anipotts.localhost:1355",
    "http://feature.admin.anipotts.localhost:1355",
    "http://anipotts.localhost:1355",
  ])("never grants a non-loopback host %s", (origin) => {
    expect(decideAdminAccess(request({ origin }))).toBe("passkey-required");
  });

  const spoofed: { name: string; headers: Record<string, string> }[] = [
    { name: "Host naming production", headers: { host: "admin.anipotts.com" } },
    {
      name: "Host naming another local port host",
      headers: { host: "127.0.0.1:4321" },
    },
    { name: "empty Host", headers: { host: "" } },
    {
      name: "X-Forwarded-Host naming production",
      headers: { "x-forwarded-host": "admin.anipotts.com" },
    },
    {
      name: "a later X-Forwarded-Host hop naming production",
      headers: { "x-forwarded-host": "localhost:4321, admin.anipotts.com" },
    },
    {
      name: "Forwarded host naming production",
      headers: { forwarded: 'for=127.0.0.1;host="admin.anipotts.com"' },
    },
    {
      name: "remote X-Forwarded-For client",
      headers: { "x-forwarded-for": "127.0.0.1, 203.0.113.9" },
    },
    {
      name: "remote Forwarded client",
      headers: { forwarded: "for=203.0.113.9" },
    },
    {
      name: "tunnelled Cloudflare client",
      headers: { "cf-connecting-ip": "203.0.113.9" },
    },
    { name: "remote X-Real-IP", headers: { "x-real-ip": "198.51.100.4" } },
    {
      name: "cross-origin browser write",
      headers: { origin: "https://attacker.example" },
    },
    {
      name: "another local origin writing",
      headers: { origin: "http://localhost:4311" },
    },
    {
      name: "cross-site fetch metadata on a write",
      headers: { "sec-fetch-site": "cross-site" },
    },
  ];
  test.each(spoofed)(
    "refuses a spoofed or proxied request: $name",
    ({ headers }) => {
      const input = request({ headers });
      expect(decideAdminAccess(input)).toBe("passkey-required");
      expect(isLocalOwnerRequest({ enabled: true, ...input })).toBe(false);
    },
  );

  test("keeps public paths public and checks the owner before a session", () => {
    for (const path of ["/auth", "/api/health", "/api/mcp", "/_astro/app.js"])
      expect(decideAdminAccess(request({ path, method: "GET" }))).toBe(
        "public",
      );
    expect(decideAdminAccess(request({ hasSession: true }))).toBe(
      "local-owner",
    );
    expect(
      decideAdminAccess(
        request({
          origin: "http://localhost:4311",
          path: "/inbox",
          method: "GET",
        }),
      ),
    ).toBe("local-owner");
  });
});
