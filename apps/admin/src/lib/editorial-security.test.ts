import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkEditorialMutation,
  issueEditorialCsrf,
  privateJson,
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
    const response = privateJson({ error: "forbidden" }, 403);
    expect(response.status).toBe(403);
    expect(response.headers.get("CDN-Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
  });
});
describe("compiled local owner CSRF cookie", () => {
  const local = "http://127.0.0.1:8873";
  const localCookie = "editorial-local-owner-csrf";
  function localRequest(headers: Record<string, string> = {}) {
    return new Request(`${local}/api/editorial/save`, {
      method: "POST",
      headers: {
        Host: "127.0.0.1:8873",
        Origin: local,
        "Sec-Fetch-Site": "same-origin",
        Cookie: `${localCookie}=${token}`,
        "X-Editorial-CSRF": token,
        "Content-Type": "application/json",
        ...headers,
      },
    });
  }
  afterEach(() => vi.unstubAllGlobals());

  it("issues a distinct HttpOnly Strict host cookie and checks its token", async () => {
    vi.stubGlobal("__LOCAL_OWNER_BUILD__", true);
    const response = issueEditorialCsrf(localRequest());
    expect(response.headers.get("Set-Cookie")).toBe(
      `${localCookie}=${token}; Path=/; HttpOnly; SameSite=Strict`,
    );
    expect(await response.json()).toEqual({ csrf: token });
    expect(checkEditorialMutation(localRequest(), local)).toBeNull();
    expect(
      checkEditorialMutation(
        localRequest({ "X-Editorial-CSRF": "b".repeat(64) }),
        local,
      ),
    ).toBe("csrf_required");
    expect(
      checkEditorialMutation(
        localRequest({
          Cookie: `${localCookie}=${token}; ${localCookie}=${token}`,
        }),
        local,
      ),
    ).toBe("csrf_required");
  });

  it("retains exact origin, fetch-site and JSON requirements locally", () => {
    vi.stubGlobal("__LOCAL_OWNER_BUILD__", true);
    expect(checkEditorialMutation(localRequest(), origin)).toBe(
      "origin_required",
    );
    expect(
      checkEditorialMutation(localRequest({ Origin: origin }), local),
    ).toBe("origin_required");
    expect(
      checkEditorialMutation(
        localRequest({ "Sec-Fetch-Site": "cross-site" }),
        local,
      ),
    ).toBe("origin_required");
    expect(
      checkEditorialMutation(
        localRequest({ "Content-Type": "text/plain" }),
        local,
      ),
    ).toBe("json_required");
  });

  it.each([undefined, false, true])(
    "retains the production Secure cookie and checker with flag %s",
    (enabled) => {
      vi.stubGlobal("__LOCAL_OWNER_BUILD__", enabled);
      const response = issueEditorialCsrf(request());
      expect(response.headers.get("Set-Cookie")).toBe(
        `__Host-editorial-csrf=${token}; Path=/; HttpOnly; Secure; SameSite=Strict`,
      );
      expect(checkEditorialMutation(request(), origin)).toBeNull();
      expect(
        checkEditorialMutation(
          request({ Cookie: `${localCookie}=${token}` }),
          origin,
        ),
      ).toBe("csrf_required");
    },
  );

  it.each([
    [false, {}],
    [true, { Host: "evil.example" }],
    [true, { "X-Forwarded-Host": "evil.example" }],
    [true, { "X-Forwarded-For": "203.0.113.10" }],
    [true, { Forwarded: "for=203.0.113.10" }],
  ] as const)(
    "cannot select the local cookie without eligible authority: %s %j",
    (enabled, headers) => {
      vi.stubGlobal("__LOCAL_OWNER_BUILD__", enabled);
      const supplied = localRequest(headers);
      const response = issueEditorialCsrf(supplied);
      // Do not inspect a generated token; only the name and cookie attributes.
      expect(response.headers.get("Set-Cookie")?.split("=")[0]).toBe(
        "__Host-editorial-csrf",
      );
      expect(response.headers.get("Set-Cookie")).toContain(
        "; HttpOnly; Secure; SameSite=Strict",
      );
      expect(checkEditorialMutation(supplied, local)).toBe("csrf_required");
    },
  );
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
