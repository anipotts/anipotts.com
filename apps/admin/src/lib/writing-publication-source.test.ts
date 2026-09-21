import { expect, it } from "vitest";
import { parseEditorialSource } from "@anipotts/content/editorial/source";
import { prepareWritingPublication } from "./writing-publication-source";
it("prepares visibility and date in the private candidate without changing authored text", () => {
  const source =
    "---\ntitle: example\nsummary: context\nstatus: draft\n---\noriginal body\n";
  const result = prepareWritingPublication(
    source,
    new Date("2026-09-20T20:00:00Z"),
  );
  const parsed = parseEditorialSource(result);
  expect(parsed.data).toMatchObject({
    status: "published",
    published_at: "2026-09-20T20:00:00.000Z",
  });
  expect(parsed.body).toBe(parseEditorialSource(source).body);
  expect(prepareWritingPublication(result, new Date("2026-10-01"))).toBe(
    result,
  );
});
it("preserves a deliberate publication date and does not silently publish a scheduled article", () => {
  const source =
    "---\ntitle: example\nsummary: context\nstatus: draft\npublished_at: 2026-01-01\n---\nbody";
  expect(prepareWritingPublication(source)).toContain(
    "published_at: 2026-01-01",
  );
  const scheduled = source.replace("status: draft", "status: scheduled");
  expect(prepareWritingPublication(scheduled)).toBe(scheduled);
});
