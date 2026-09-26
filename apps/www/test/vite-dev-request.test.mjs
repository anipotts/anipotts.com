import assert from "node:assert/strict";
import test from "node:test";
import { isViteDevRequest } from "../src/lib/vite-dev-request.ts";

const request = (path, { method = "GET", dest } = {}) => ({
  url: `http://127.0.0.1:4400${path}`,
  method,
  headers: new Headers(dest ? { "sec-fetch-dest": dest } : {}),
});

test("only Vite module and client requests bypass the dev Worker", () => {
  for (const path of ["/@vite/client", "/@id/x", "/@fs/a.js", "/src/a.css"])
    assert.equal(isViteDevRequest(request(path)), true, path);
  assert.equal(
    isViteDevRequest(request("/Users/me/app/src/App.tsx", { dest: "script" })),
    true,
  );
  for (const [path, options] of [
    ["/", { dest: "document" }],
    ["/writing/x", {}],
    ["/api/editorial/media?id=a.png", { dest: "image" }],
    ["/src/a.css", { method: "POST" }],
  ])
    assert.equal(isViteDevRequest(request(path, options)), false, path);
});
