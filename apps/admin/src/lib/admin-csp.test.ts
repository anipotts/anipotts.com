import { describe, expect, it } from "vitest";
import { createAdminScriptNonce, withAdminScriptNonce } from "./admin-csp";

describe("admin script CSP", () => {
  it("generates a new 128-bit nonce for each response", () => {
    const first = createAdminScriptNonce();
    const second = createAdminScriptNonce();
    expect(Buffer.from(first, "base64")).toHaveLength(16);
    expect(second).not.toBe(first);
  });

  it("adds the nonce only to Astro's script policy while retaining its hashes", () => {
    const response = new Response("<html></html>", {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "object-src 'none'; script-src 'self' 'sha256-synthetic'; style-src 'self' 'unsafe-inline'",
      },
    });
    withAdminScriptNonce(response, "syntheticNonce");
    expect(response.headers.get("Content-Security-Policy")).toBe(
      "object-src 'none'; script-src 'self' 'sha256-synthetic' 'nonce-syntheticNonce'; style-src 'self' 'unsafe-inline'",
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("also updates an explicit script element policy if Astro emits one", () => {
    const response = new Response("<html></html>", {
      headers: {
        "Content-Type": "text/html",
        "Content-Security-Policy":
          "script-src 'self'; script-src-elem 'self' 'sha256-synthetic'; script-src-attr 'none'",
      },
    });
    withAdminScriptNonce(response, "syntheticNonce");
    expect(response.headers.get("Content-Security-Policy")).toBe(
      "script-src 'self' 'nonce-syntheticNonce'; script-src-elem 'self' 'sha256-synthetic' 'nonce-syntheticNonce'; script-src-attr 'none'",
    );
  });

  it("preserves the separate embedded-preview sandbox and non-HTML responses", () => {
    const preview = new Response("<html></html>", {
      headers: {
        "Content-Type": "text/html",
        "Content-Security-Policy":
          "sandbox allow-scripts; form-action 'none'; frame-ancestors 'self'; connect-src 'none'",
      },
    });
    const api = Response.json(
      { ok: true },
      {
        headers: { "Content-Security-Policy": "script-src 'none'" },
      },
    );
    const previewPolicy = preview.headers.get("Content-Security-Policy");
    withAdminScriptNonce(preview, "syntheticNonce");
    withAdminScriptNonce(api, "syntheticNonce");
    expect(preview.headers.get("Content-Security-Policy")).toBe(previewPolicy);
    expect(api.headers.get("Content-Security-Policy")).toBe(
      "script-src 'none'",
    );
  });
});
