import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("leaves scroll indicators to native browser preferences on every admin surface", () => {
  const css = readFileSync(
    new URL("./scrollbars.css", import.meta.url),
    "utf8",
  );
  const declarations = css.replace(/\/\*[\s\S]*?\*\//g, "");
  expect(declarations).not.toMatch(
    /scrollbar-width\s*:\s*none|::-webkit-scrollbar/,
  );
  expect(declarations).not.toMatch(/overflow(?:-[xy])?\s*:\s*(?:hidden|clip)/);
});
