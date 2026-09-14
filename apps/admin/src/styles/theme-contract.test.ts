import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Admin colors switch on the computed color-scheme, the same switch Astryx
// uses through light-dark(). System mode removes html[data-theme], so tokens
// keyed on that attribute stay light while Astryx text turns light.
const css = readFileSync(new URL("./admin.css", import.meta.url), "utf8");

type Block = { preludes: string[]; declarations: [string, string][] };

// Every block with its enclosing preludes and its own declarations.
function blocks(source: string): Block[] {
  const found: Block[] = [];
  const stack: Block[] = [];
  let buffer = "";
  let quote = "";
  let depth = 0;
  const declaration = () => {
    const text = buffer.trim();
    buffer = "";
    const colon = text.indexOf(":");
    if (!stack.length || colon < 0) return;
    stack.at(-1)?.declarations.push([
      text.slice(0, colon).trim(),
      text
        .slice(colon + 1)
        .trim()
        .replace(/\s+/g, " "),
    ]);
  };
  for (const char of source.replace(/\/\*[\s\S]*?\*\//g, "")) {
    if (quote) {
      buffer += char;
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    if (char === "(") depth++;
    else if (char === ")") depth--;
    if (quote || depth > 0 || char === ")") {
      buffer += char;
      continue;
    }
    if (char === "{") {
      const block: Block = {
        preludes: [
          ...(stack.at(-1)?.preludes ?? []),
          buffer.trim().replace(/\s+/g, " "),
        ],
        declarations: [],
      };
      buffer = "";
      stack.push(block);
      found.push(block);
    } else if (char === "}") {
      declaration();
      stack.pop();
    } else if (char === ";") declaration();
    else buffer += char;
  }
  return found;
}

const COLOR =
  /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(|\b(?:white|black|transparent|currentcolor)\b/i;
const ownSelectors = (block: Block) =>
  (block.preludes.at(-1) ?? "").split(",").map((selector) => selector.trim());

// Color tokens on :root must be light-dark() pairs or aliases of other tokens.
function unswitchedRootColors(source: string): string[] {
  return blocks(source)
    .filter((block) => ownSelectors(block).includes(":root"))
    .flatMap((block) => block.declarations)
    .filter(
      ([name, value]) =>
        name.startsWith("--") &&
        // Focus rings keep one color in both schemes; focus.css owns them.
        name !== "--color-focus" &&
        !/^light-dark\(.+,.+\)$/.test(value) &&
        !/^var\(--[\w-]+\)$/.test(value) &&
        COLOR.test(value),
    )
    .map(([name, value]) => `${name}: ${value}`);
}

function themedCustomProperties(source: string): string[] {
  return blocks(source)
    .filter((block) =>
      block.preludes.some((prelude) =>
        /\[data-theme\b|prefers-color-scheme/.test(prelude),
      ),
    )
    .flatMap((block) =>
      block.declarations
        .filter(([name]) => name.startsWith("--"))
        .map(([name]) => `${block.preludes.join(" ")} ${name}`),
    );
}

// AdminLayout and the prepaint script set color-scheme inline on <html>.
function pinnedRootSchemes(source: string): string[] {
  return blocks(source)
    .filter((block) =>
      ownSelectors(block).some((selector) =>
        [":root", "html"].includes(selector),
      ),
    )
    .flatMap((block) =>
      block.declarations
        .filter(([name]) => name === "color-scheme")
        .map(([, value]) => `${block.preludes.join(" ")} ${value}`),
    );
}

describe("theme contract guard fixtures", () => {
  const fixture = `
    @import "tokens.css";
    :root {
      color-scheme: light;
      --space: 1rem;
      --font: var(--sans);
      --ink: #0b1220;
      --line: color-mix(in srgb, var(--ink) 20%, transparent);
      --surface: light-dark(#ffffff, var(--brand-elevated-surface));
      --alias: var(--surface);
      --color-focus: #25689f;
      background: url("data:image/svg+xml;utf8,<svg></svg>");
    }
    html { background: var(--bg); color-scheme: light; }
    html[data-theme="dark"] { color-scheme: dark; --ink: #f7faff; }
    @media (prefers-color-scheme: dark) { :root { --ink: #f7faff; } }
    html[data-astryx-theme="neutral"] { --color-text-primary: var(--ink); }
  `;

  it("flags static colors on :root and allows pairs, aliases and focus", () => {
    expect(unswitchedRootColors(fixture)).toEqual([
      "--ink: #0b1220",
      "--line: color-mix(in srgb, var(--ink) 20%, transparent)",
      "--ink: #f7faff",
    ]);
  });

  it("flags custom properties inside theme attribute and media blocks", () => {
    expect(themedCustomProperties(fixture)).toEqual([
      'html[data-theme="dark"] --ink',
      "@media (prefers-color-scheme: dark) :root --ink",
    ]);
  });

  it("flags color-scheme declared on bare :root or html", () => {
    expect(pinnedRootSchemes(fixture)).toEqual([":root light", "html light"]);
  });
});

it("switches every admin :root color token with light-dark()", () => {
  expect(
    blocks(css).some((block) => ownSelectors(block).includes(":root")),
  ).toBe(true);
  expect(unswitchedRootColors(css)).toEqual([]);
});

it("declares no custom properties under [data-theme] or prefers-color-scheme", () => {
  expect(themedCustomProperties(css)).toEqual([]);
});

it("leaves the root color-scheme to the layout's inline style", () => {
  expect(pinnedRootSchemes(css)).toEqual([]);
  const layout = readFileSync(
    new URL("../layouts/AdminLayout.astro", import.meta.url),
    "utf8",
  );
  expect(layout).toContain(
    'colorScheme: initialMode === "system" ? "light dark" : initialMode',
  );
});
