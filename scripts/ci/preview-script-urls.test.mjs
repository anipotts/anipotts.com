import assert from "node:assert/strict";
import test from "node:test";
import { adminPreviewIdentity } from "../dev/admin-preview-identity.mjs";

function request(url) {
  let middleware;
  const plugin = adminPreviewIdentity("/checkout/");
  assert.equal(plugin.apply, "serve");
  plugin.configureServer({middlewares:{use:fn=>{middleware=fn;}}});
  const headers = {};
  const result = {statusCode:200,setHeader:(name,value)=>{headers[name]=value;},end:()=>{result.ended=true;}};
  let passed=false;
  middleware({url,method:"GET"},result,()=>{passed=true;});
  return {result,headers,passed};
}

test("filesystem component scripts redirect to the application's Vite URL", () => {
  for (const query of ["astro&type=script&index=0&lang.ts", "type=script&astro=&index=0&lang.ts"]) {
    const {result,headers,passed}=request(`/checkout/apps/www/src/layouts/Shell.astro?${query}`);
    assert.equal(result.statusCode,302);
    assert.equal(result.ended,true);
    assert.equal(headers.Location,`/src/layouts/Shell.astro?${query}`);
    assert.equal(headers["Cache-Control"],"no-store");
    assert.equal(passed,false);
  }
});

test("installed Astro router uses Vite's filesystem allow-list", () => {
  const path="/checkout/node_modules/.pnpm/astro@7/node_modules/astro/components/ClientRouter.astro";
  assert.equal(request(`${path}?astro&type=script`).headers.Location,`/@fs${path}?astro&type=script`);
});

test("ordinary URLs and unrelated disk paths are not rewritten", () => {
  for (const url of ["/src/layouts/Shell.astro?astro&type=script", "/checkout/apps/www/src/layouts/Shell.astro?astro&type=style", "/elsewhere/Private.astro?astro&type=script", "/checkout/apps/admin/src/pages/auth.astro?astro&type=script", "/checkout/node_modules/.pnpm/other/Private.astro?astro&type=script"]) {
    const {result,headers,passed}=request(url);
    assert.equal(passed,true,url);
    assert.equal(result.ended,undefined,url);
    assert.equal(headers.Location,undefined,url);
  }
});
