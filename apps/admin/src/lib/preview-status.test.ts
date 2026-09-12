import { it, expect } from "vitest";
import { previewFailure } from "./preview-status";
it("returns a private fixed failure handshake without permitting a script breakout", async () => {
  const url = new URL("https://admin.anipotts.com/preview/record");
  const request = '</script><script>alert("x")</script>\\literal';
  url.searchParams.set("previewRequest", request);
  const response = previewFailure(url, "stale", 409);
  const html = await response.text();
  expect(response.status).toBe(409);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(html).toContain('"status":"stale"');
  expect(html).not.toContain("<script>alert(1)");
  expect(html).toContain("\\u003c/script>");
  expect(html.match(/<script>/gi)).toHaveLength(1);
  expect(html.match(/<\/script>/gi)).toHaveLength(1);
  const serialized = /parent\.postMessage\((.*),"\*"\)/.exec(html)![1]!;
  expect(JSON.parse(serialized)).toEqual({
    type: "editorial-preview-status",
    request,
    status: "stale",
  });
});
