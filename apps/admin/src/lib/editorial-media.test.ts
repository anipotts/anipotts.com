import { expect, it } from "vitest";
import {
  editorialImagePreview,
  editorialImagePreviewUri,
} from "./editorial-media";

it("routes validated stored media to its private preview", () => {
  const id = `${"a".repeat(64)}.png`;
  expect(editorialImagePreview(`/images/editorial/${id}`)).toBe(
    `/api/editorial/media?id=${id}`,
  );
});

it.each([
  "/images/a%20b.png?size=2&crop=1",
  "https://example.com/a%20b.png?size=2&crop=1",
  "https://example.com/a%2Fb%25c.png?next=%2Fimages%2Fone.png",
])("keeps accepted asset URL bytes intact: %s", (url) => {
  expect(editorialImagePreview(url)).toBe(url);
  expect(editorialImagePreviewUri(url)).toBe(url);
});

it("preserves an accepted scheme without rewriting the source spelling", () => {
  expect(editorialImagePreview("HTTPS://example.com/a.png")).toBe(
    "HTTPS://example.com/a.png",
  );
});

it("URI-encodes Unicode in preview paths without changing query separators", () => {
  expect(editorialImagePreview("/images/café.png?size=2&crop=1")).toBe(
    "/images/café.png?size=2&crop=1",
  );
  expect(editorialImagePreviewUri("/images/café.png?size=2&crop=1")).toBe(
    "/images/caf%C3%A9.png?size=2&crop=1",
  );
});

it("rejects malformed Unicode rather than throwing while rendering", () => {
  expect(editorialImagePreviewUri("/images/\uD800.png")).toBe("");
});

it.each([
  "",
  "//example.com/a.png",
  "ftp://example.com/a.png",
  "data:text/plain,example",
  "https://example.com/a b.png",
  "/images/<sample>.png",
])("rejects a value outside the asset URL contract: %s", (url) => {
  expect(editorialImagePreview(url)).toBe("");
  expect(editorialImagePreviewUri(url)).toBe("");
});
