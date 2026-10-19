import { describe, expect, it } from "vitest";
import { isLocalOwnerHttpCsrfRequest } from "./editorial-local-csrf-policy";

const local = "http://127.0.0.1:8873";
function request(
  origin = local,
  headers: Record<string, string> = {},
  method = "POST",
) {
  return new Request(`${origin}/api/editorial/save`, {
    method,
    headers: {
      Host: new URL(origin).host,
      Origin: origin,
      "Sec-Fetch-Site": "same-origin",
      ...headers,
    },
  });
}

describe("plain HTTP local owner CSRF eligibility", () => {
  it.each([local, "http://localhost:4311", "http://[::1]:8873"])(
    "admits direct compiled local owner requests at %s",
    (origin) => {
      expect(isLocalOwnerHttpCsrfRequest(request(origin), true)).toBe(true);
    },
  );

  it("requires the compiled flag even when headers or URL claim it", () => {
    expect(
      isLocalOwnerHttpCsrfRequest(
        new Request(`${local}/api/editorial/csrf?ADMIN_LOCAL_OWNER=1`, {
          headers: { ADMIN_LOCAL_OWNER: "1", "X-Local-Owner": "true" },
        }),
        false,
      ),
    ).toBe(false);
  });

  it.each([
    "https://localhost:4311",
    "https://admin.anipotts.com",
    "http://admin.anipotts.com",
    "http://127.0.0.1.evil.example:8873",
    "http://192.168.1.10:8873",
  ])("keeps the standard policy at %s", (origin) => {
    expect(isLocalOwnerHttpCsrfRequest(request(origin), true)).toBe(false);
  });

  it.each<Record<string, string>>([
    { Host: "evil.example" },
    { "X-Forwarded-Host": "evil.example" },
    { "X-Forwarded-For": "203.0.113.10" },
    { "X-Real-IP": "203.0.113.10" },
    { "CF-Connecting-IP": "203.0.113.10" },
    { "True-Client-IP": "203.0.113.10" },
    { Forwarded: 'for="203.0.113.10";host="127.0.0.1:8873"' },
    { Origin: "https://evil.example" },
    { "Sec-Fetch-Site": "same-site" },
  ])("refuses forged authority or nonlocal clients: %j", (headers) => {
    expect(isLocalOwnerHttpCsrfRequest(request(local, headers), true)).toBe(
      false,
    );
  });
});
