import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
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

// Splits on commas outside parentheses, brackets and quotes.
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;
    else if (char === "," && depth === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

// A compound selector that matches the document root element: :root or html,
// bare or qualified (html.admin, :root:not(.x), html[data-astryx-theme]), or
// wrapped in :where() or :is(). Selectors with combinators target descendants.
function isRootSelector(selector: string): boolean {
  const source = selector.trim();
  if (!source || source.includes("::")) return false;
  let outer = "";
  const wrapped: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  let wrapper = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[") {
      if (depth === 0) {
        start = index + 1;
        wrapper = char === "(" && /:(?:is|where)$/i.test(outer);
      }
      depth++;
    } else if (char === ")" || char === "]") {
      depth--;
      if (depth === 0 && wrapper) wrapped.push(source.slice(start, index));
    } else if (depth === 0) {
      if (/[\s>+~]/.test(char)) return false;
      outer += char;
    }
  }
  return (
    /^html(?![\w-])/i.test(outer) ||
    /:root(?![\w-])/i.test(outer) ||
    wrapped.some((list) => splitTopLevel(list).some(isRootSelector))
  );
}

// CSS Color 4 named colors, plus the transparent and currentcolor keywords.
const NAMED_COLORS = `aliceblue antiquewhite aqua aquamarine azure beige bisque
  black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse
  chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan
  darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta
  darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
  darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink
  deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen
  fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey
  honeydew hotpink indianred indigo ivory khaki lavender lavenderblush
  lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow
  lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen
  lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime
  limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid
  mediumpurple mediumseagreen mediumslateblue mediumspringgreen
  mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
  navajowhite navy oldlace olive olivedrab orange orangered orchid
  palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff
  peru pink plum powderblue purple rebeccapurple red rosybrown royalblue
  saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue
  slateblue slategray slategrey snow springgreen steelblue tan teal thistle
  tomato turquoise violet wheat white whitesmoke yellow yellowgreen
  transparent currentcolor`
  .trim()
  .split(/\s+/);
// A custom property name such as --brand-white is not a color keyword.
const COLOR = new RegExp(
  String.raw`#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(|(?<![\w-])(?:${NAMED_COLORS.join("|")})(?![\w-])`,
  "i",
);
const hasColor = (value: string) =>
  COLOR.test(
    value.replace(/url\([^)]*\)/gi, "").replace(/(["'])(?:(?!\1).)*\1/g, ""),
  );

const ownSelectors = (block: Block) =>
  splitTopLevel(block.preludes.at(-1) ?? "");

// light-dark() with exactly two arguments and nothing around it.
function isLightDarkPair(value: string): boolean {
  const match = /^light-dark\((.*)\)$/i.exec(value);
  if (!match) return false;
  const inner = match[1];
  let depth = 0;
  for (const char of inner) {
    if (char === "(") depth++;
    else if (char === ")" && --depth < 0) return false;
  }
  const args = splitTopLevel(inner);
  return depth === 0 && args.length === 2 && args.every(Boolean);
}

const rootDeclarations = (source: string) =>
  blocks(source)
    .filter((block) => ownSelectors(block).some(isRootSelector))
    .flatMap((block) => block.declarations)
    .filter(([name]) => name.startsWith("--"));

// Tokens that follow color-scheme: light-dark() pairs on the root, and root
// aliases that reach one. Extra sources contribute aliases only, such as the
// brand --surface: var(--color-surface-elevated).
function switchedTokens(source: string, aliasSources: string[] = []) {
  const switched = new Set(
    rootDeclarations(source)
      .filter(([, value]) => isLightDarkPair(value))
      .map(([name]) => name),
  );
  const aliases = [source, ...aliasSources]
    .flatMap(rootDeclarations)
    .flatMap(([name, value]) => {
      const target = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
      return target ? [[name, target] as const] : [];
    });
  for (let grew = true; grew;) {
    grew = false;
    for (const [name, target] of aliases) {
      if (switched.has(target) && !switched.has(name)) {
        switched.add(name);
        grew = true;
      }
    }
  }
  return switched;
}

// color-mix() of switched tokens, transparent or currentcolor follows the
// scheme too. A static primitive such as var(--brand-white) does not.
function mixesSwitchedTokens(value: string, switched: Set<string>): boolean {
  if (!/^color-mix\(/i.test(value)) return false;
  const references = [...value.matchAll(/var\((--[\w-]+)\)/g)];
  if (!references.every(([, name]) => switched.has(name))) return false;
  const rest = value
    .replace(/var\(--[\w-]+\)/g, "")
    .replace(/^color-mix\(/i, "(")
    .replace(/(?<![\w-])(?:transparent|currentcolor)(?![\w-])/gi, "");
  return !/var\(/.test(rest) && !hasColor(rest);
}

// Color tokens on the root element must switch with color-scheme: a
// light-dark() pair, an alias of another token, or a mix of switched tokens.
function unswitchedRootColors(
  source: string,
  aliasSources: string[] = [],
): string[] {
  const switched = switchedTokens(source, aliasSources);
  return rootDeclarations(source)
    .filter(
      ([name, value]) =>
        // Focus rings keep one color in both schemes; focus.css owns them.
        name !== "--color-focus" &&
        !isLightDarkPair(value) &&
        !/^var\(--[\w-]+\)$/.test(value) &&
        !mixesSwitchedTokens(value, switched) &&
        hasColor(value),
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
// A root rule keyed on [data-theme] matches only the explicit mode it names.
function pinnedRootSchemes(source: string): string[] {
  return blocks(source)
    .filter((block) =>
      ownSelectors(block).some(
        (selector) =>
          isRootSelector(selector) && !/\[data-theme\b/.test(selector),
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
      --brand-alias: var(--brand-white);
      --color-focus: #25689f;
      --risk: orange;
      --shade: Navy;
      --one-arm: light-dark(color-mix(in srgb, #abb2be 22%, transparent));
      --display: "Snow Tomato Grotesk", serif;
      --mask: url(tan.svg);
      --gold-ease: cubic-bezier(0.2, 0, 0, 1);
      --panel: var(--panel-source);
      --mix-switched: color-mix(in srgb, var(--panel) 76%, var(--surface));
      --mix-fade: color-mix(in srgb, var(--surface) 14%, transparent);
      --mix-white: color-mix(in srgb, var(--surface) 20%, white);
      --mix-primitive: color-mix(in srgb, var(--brand-white) 8%, var(--surface));
      --mix-fallback: color-mix(in srgb, var(--missing, #ffffff) 8%, var(--surface));
      background: url("data:image/svg+xml;utf8,<svg></svg>");
    }
    html { background: var(--bg); color-scheme: light; }
    html[data-theme="dark"] { color-scheme: dark; --ink: #f7faff; }
    @media (prefers-color-scheme: dark) { :root { --ink: #f7faff; } }
    html[data-astryx-theme="neutral"] { --color-text-primary: var(--ink); }
    :where(:root) { color-scheme: light; --where-ink: #111111; }
    html.admin { --html-ink: rgb(0 0 0); }
    :root:not(.embedded), .theme-preview { --qualified-ink: black; }
    :is(html, body) { --is-ink: tan; }
    html[data-astryx-theme="editorial"][data-theme="light"] { color-scheme: light; }
    :root .card, html > body, :not(:root) { --descendant-ink: #222222; }
    :root::selection { --selection-ink: red; }
  `;

  it("flags static colors on root selectors and allows pairs, aliases and focus", () => {
    // --panel-source reaches a pair only through the alias source.
    const aliases = ":root { --panel-source: var(--alias); }";
    expect(unswitchedRootColors(fixture, [aliases])).toEqual([
      "--ink: #0b1220",
      "--line: color-mix(in srgb, var(--ink) 20%, transparent)",
      "--risk: orange",
      "--shade: Navy",
      "--one-arm: light-dark(color-mix(in srgb, #abb2be 22%, transparent))",
      "--mix-white: color-mix(in srgb, var(--surface) 20%, white)",
      "--mix-primitive: color-mix(in srgb, var(--brand-white) 8%, var(--surface))",
      "--mix-fallback: color-mix(in srgb, var(--missing, #ffffff) 8%, var(--surface))",
      "--ink: #f7faff",
      "--ink: #f7faff",
      "--where-ink: #111111",
      "--html-ink: rgb(0 0 0)",
      "--qualified-ink: black",
      "--is-ink: tan",
    ]);
  });

  it("recognizes selectors that match the root element", () => {
    const root = [
      ":root",
      "html",
      "HTML",
      ":where(:root)",
      ":is(html, body)",
      "html.admin",
      'html[data-astryx-theme="neutral"]',
      ":root:not(.embedded)",
      ':root[data-theme="dark"]',
    ];
    const other = [
      ":root .card",
      "html > body",
      ":not(:root)",
      ":root::selection",
      "htmlish",
      ".html",
      ":where(.card)",
      "body",
    ];
    expect(root.filter((selector) => !isRootSelector(selector))).toEqual([]);
    expect(other.filter(isRootSelector)).toEqual([]);
  });

  it("flags custom properties inside theme attribute and media blocks", () => {
    expect(themedCustomProperties(fixture)).toEqual([
      'html[data-theme="dark"] --ink',
      "@media (prefers-color-scheme: dark) :root --ink",
    ]);
  });

  it("flags color-scheme declared on root selectors outside [data-theme]", () => {
    expect(pinnedRootSchemes(fixture)).toEqual([
      ":root light",
      "html light",
      ":where(:root) light",
    ]);
  });
});

it("switches every admin root color token with color-scheme", () => {
  expect(
    blocks(css).some((block) => ownSelectors(block).includes(":root")),
  ).toBe(true);
  // admin.css imports the brand tokens, whose aliases name the switched
  // --color-* tokens (--surface, --bg, --interactive).
  const brandTokens = readFileSync(
    createRequire(import.meta.url).resolve("@anipotts/brand/tokens.css"),
    "utf8",
  );
  expect(css).toContain('@import "@anipotts/brand/tokens.css"');
  expect(unswitchedRootColors(css, [brandTokens])).toEqual([]);
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
