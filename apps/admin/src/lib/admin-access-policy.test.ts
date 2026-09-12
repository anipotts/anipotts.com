import { describe, expect, test } from "vitest";
import {
  decideAdminAccess,
  isDevLoopbackPreviewRequest,
  isPublicAdminPath,
} from "./admin-access-policy";

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
    "http://admin.anipotts.localhost:1355",
    "http://portless-local-2026-08-21.admin.anipotts.localhost:1355",
    "https://admin.anipotts.localhost",
  ])("accepts an exact Portless development origin %s", (origin) => {
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
        url: local(path, "http://admin.anipotts.localhost:1355"),
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
        "http://admin.anipotts.localhost:1355",
      ),
    },
    {
      name: "non-loopback host",
      isDev: true,
      method: "GET",
      url: local("/inbox", "https://admin.anipotts.com"),
    },
    {
      name: "wrong port",
      isDev: true,
      method: "GET",
      url: local("/inbox", "http://localhost:4321"),
    },
    {
      name: "unapproved auth operation",
      isDev: true,
      method: "GET",
      url: local("/auth/device/opaque-request"),
    },
    {
      name: "wrong Portless port",
      isDev: true,
      method: "GET",
      url: local("/inbox", "http://admin.anipotts.localhost:4311"),
    },
    {
      name: "lookalike Portless host",
      isDev: true,
      method: "GET",
      url: local("/inbox", "http://admin.anipotts.localhost.example:1355"),
    },
    {
      name: "nested Portless subdomain",
      isDev: true,
      method: "GET",
      url: local(
        "/inbox",
        "http://nested.branch.admin.anipotts.localhost:1355",
      ),
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
    { isDev: true, method: "GET", url: local("/api/admin/observability") },
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
