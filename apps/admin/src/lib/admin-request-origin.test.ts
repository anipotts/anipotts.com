import { describe, expect, it } from "vitest";
import {
  deniedAdminOrigin,
  isAdminRequestOriginAllowed,
} from "./admin-request-origin";

function request(href: string, headers: HeadersInit = {}): Request {
  const url = new URL(href);
  return new Request(url, {
    headers: { Host: url.host, ...headers },
  });
}

describe("admin origin admission", () => {
  it("admits the canonical production origin", () => {
    expect(
      isAdminRequestOriginAllowed(
        request("https://admin.anipotts.com/api/private-reader/credential"),
        false,
        false,
      ),
    ).toBe(true);
  });

  it.each([
    "http://admin.anipotts.com/content",
    "https://admin.anipotts.com.evil.test/content",
    "https://anipotts.com/content",
    "https://admin-preview.anipotts.com/content",
    "https://anipotts-admin.workers.dev/content",
    "https://anipotts-admin.pages.dev/content",
  ])("rejects alternate production origin %s", (href) => {
    expect(isAdminRequestOriginAllowed(request(href), false, false)).toBe(
      false,
    );
  });

  it("keeps loopback admission behind a development or local-owner build", () => {
    const local = request("http://127.0.0.1:4311/content");
    expect(isAdminRequestOriginAllowed(local, false, false)).toBe(false);
    expect(isAdminRequestOriginAllowed(local, true, false)).toBe(true);
    expect(isAdminRequestOriginAllowed(local, false, true)).toBe(true);
    expect(
      isAdminRequestOriginAllowed(
        request("http://127.0.0.1:4311/content", {
          "X-Forwarded-Host": "admin.anipotts.com",
        }),
        true,
        false,
      ),
    ).toBe(false);
    expect(
      isAdminRequestOriginAllowed(
        request("http://127.0.0.1:4311/content", {
          "X-Forwarded-For": "203.0.113.42",
        }),
        false,
        true,
      ),
    ).toBe(false);
  });

  it("returns an inert, uncached denial", () => {
    const denial = deniedAdminOrigin();
    expect(denial.status).toBe(403);
    expect(denial.headers.get("Cache-Control")).toBe("private, no-store");
    expect(denial.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(denial.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
