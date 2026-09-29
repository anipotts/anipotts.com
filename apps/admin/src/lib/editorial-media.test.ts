import { expect, it } from "vitest";
import { editorialImagePreview } from "./editorial-media";

it("routes validated stored media to its private preview", () => {
  const id = `${"a".repeat(64)}.png`;
  expect(editorialImagePreview(`/images/editorial/${id}`)).toBe(
    `/api/editorial/media?id=${id}`,
  );
});

it.each([
  "/images/a%20b.png?size=2&crop=1",
  "https://example.com/a%20b.png?size=2&crop=1",
])("keeps accepted asset URL bytes intact: %s", (url) => {
  expect(editorialImagePreview(url)).toBe(url);
});

it("canonicalizes the allowed external scheme", () => {
  expect(editorialImagePreview("HTTPS://example.com/a.png")).toBe(
    "https://example.com/a.png",
  );
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
});
