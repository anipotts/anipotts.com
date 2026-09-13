import assert from "node:assert/strict";
import test from "node:test";
import { isExternalDestination } from "../src/lib/link-destination.ts";

test("absolute https destinations are external", () => {
  for (const href of [
    "https://example.com",
    "https://example.com/path#details",
    "HTTPS://example.com/path",
  ])
    assert.equal(isExternalDestination(href), true, href);
});

test("internal destinations stay in the current tab", () => {
  for (const href of [
    "/work/example",
    "/work/example#details",
    "#details",
    "mailto:owner@example.com",
  ])
    assert.equal(isExternalDestination(href), false, href);
});

test("absent destinations are not external", () => {
  for (const href of [undefined, null, ""])
    assert.equal(isExternalDestination(href), false, String(href));
});
