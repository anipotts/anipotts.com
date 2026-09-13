import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewChanges } from "./ReviewChanges";

function review(before: string, after: string) {
  return renderToStaticMarkup(
    <ReviewChanges
      destination="anipotts.com/"
      before={before}
      after={after}
      changes={[{ label: "Subtitle", before, after, rich: true }]}
    />,
  );
}

describe("rich field review", () => {
  it("shows changed URL and changed wording in the same review", () => {
    const html = review(
      "read [old copy](https://before.example/old)",
      "read [new copy](https://after.example/new)",
    );
    expect(html).toContain("Formatting / links / images");
    expect(html).toContain("before");
    expect(html).toContain("after");
    expect(html).toContain("https");
    expect(html).toContain("<ins>");
    expect(html).toContain("<del>");
  });
  it("keeps plain copy edits readable when link structure is unchanged", () => {
    const html = review(
      "old [link](https://same.example/)",
      "new [link](https://same.example/)",
    );
    expect(html).not.toContain("Formatting / links / images");
    expect(html).not.toContain("https://same.example");
    expect(html).toContain("<del>old</del><ins>new</ins>");
  });
  it("exposes image replacement alongside nearby text edits", () => {
    const html = review(
      "old ![photo](/api/editorial/media/original)",
      "new ![photo](/api/editorial/media/cropped)",
    );
    expect(html).toContain("original");
    expect(html).toContain("cropped");
    expect(html).not.toContain("<img");
  });
});

it.each([
  ["**old**", "**new**"],
  ["[old](https://same.example/)", "[new](https://same.example/)"],
  ["**[old](https://same.example/)**", "**[new](https://same.example/)**"],
])("keeps descendant copy edits readable: %s", (before, after) => {
  const html = review(before, after);
  expect(html).not.toContain("Formatting / links / images");
  expect(html).toContain("<del>old</del><ins>new</ins>");
});
it.each([
  ["**old**", "*new*"],
  ["[old](https://before.example/)", "[new](https://after.example/)"],
  [
    "![old alt](/api/editorial/media/same)",
    "![new alt](/api/editorial/media/same)",
  ],
  ["**[old](https://same.example/)**", "[**new**](https://same.example/)"],
])("retains mark and attribute changes: %s", (before, after) => {
  expect(review(before, after)).toContain("Formatting / links / images");
});
