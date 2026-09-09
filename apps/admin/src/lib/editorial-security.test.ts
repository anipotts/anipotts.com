import { describe, expect, it } from "vitest";
import {
  checkEditorialMutation,
  issueEditorialCsrf,
  privateEditorialResponse,
  readEditorialJson,
} from "./editorial-security";

const origin = "https://admin.anipotts.com";
const token = "a".repeat(64);
function request(headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/editorial/drafts`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Sec-Fetch-Site": "same-origin",
      Cookie: `__Host-editorial-csrf=${token}`,
      "X-Editorial-CSRF": token,
      "Content-Type": "application/json",
      ...headers,
    },
    body: "{}",
  });
}
describe("editorial mutation boundary", () => {
  it("requires same origin and a matching CSRF token", () => {
    expect(checkEditorialMutation(request(), origin)).toBeNull();
    expect(
      checkEditorialMutation(
        request({ Origin: "https://evil.example" }),
        origin,
      ),
    ).toBe("origin_required");
    expect(
      checkEditorialMutation(
        request({ "X-Editorial-CSRF": "b".repeat(64) }),
        origin,
      ),
    ).toBe("csrf_required");
    expect(checkEditorialMutation(request({ Cookie: "" }), origin)).toBe(
      "csrf_required",
    );
    expect(
      checkEditorialMutation(
        request({ "Sec-Fetch-Site": "same-site" }),
        origin,
      ),
    ).toBe("origin_required");
  });
  it("rejects duplicate cookies and form-compatible content types", () => {
    expect(
      checkEditorialMutation(
        request({
          Cookie: `__Host-editorial-csrf=${token}; __Host-editorial-csrf=${token}`,
        }),
        origin,
      ),
    ).toBe("csrf_required");
    expect(
      checkEditorialMutation(request({ "Content-Type": "text/plain" }), origin),
    ).toBe("json_required");
  });
  it("does not accept a request for a different deployment", () => {
    expect(checkEditorialMutation(request(), "https://preview.example")).toBe(
      "origin_required",
    );
  });
  it("issues a host-scoped secret cookie without caching", async () => {
    const response = issueEditorialCsrf();
    const body = await response.json();
    expect(body.csrf).toMatch(/^[a-f0-9]{64}$/);
    expect(response.headers.get("set-cookie")).toContain(
      "HttpOnly; Secure; SameSite=Strict",
    );
    expect(response.headers.get("set-cookie")).not.toContain("Domain=");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("keeps error responses private too", () => {
    const response = privateEditorialResponse({ error: "forbidden" }, 403);
    expect(response.status).toBe(403);
    expect(response.headers.get("CDN-Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
  });
});
describe("bounded JSON input", () => {
  it("reads valid JSON", async () => {
    expect(await readEditorialJson(request(), 10)).toEqual({});
  });
  it("enforces actual bytes without Content-Length", async () => {
    await expect(readEditorialJson(request(), 1)).rejects.toThrow(
      "request_too_large",
    );
  });
  it("rejects invalid JSON and invalid UTF-8", async () => {
    await expect(
      readEditorialJson(new Request(origin, { method: "POST", body: "{" }), 10),
    ).rejects.toThrow("invalid_json");
    await expect(
      readEditorialJson(
        new Request(origin, { method: "POST", body: new Uint8Array([255]) }),
        10,
      ),
    ).rejects.toThrow("invalid_json");
  });
});
