import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ADMIN_CANVAS } from "../lib/admin-theme";
import { editorialTheme } from "../themes/editorial.js";

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

it("takes every admin color from the switched Astryx theme tokens", () => {
  // The legacy root palette and its brand token aliases are gone; admin.css
  // declares no root tokens that could miss the color-scheme switch.
  expect(rootDeclarations(css)).toEqual([]);
  expect(unswitchedRootColors(css)).toEqual([]);
  expect(css).not.toContain("@anipotts/brand/tokens.css");
});

it("declares no custom properties under [data-theme] or prefers-color-scheme", () => {
  expect(themedCustomProperties(css)).toEqual([]);
});

it("leaves the root color-scheme to the document's inline style", () => {
  expect(pinnedRootSchemes(css)).toEqual([]);
  expect(document).toContain(
    'style={{ colorScheme: mode === "system" ? "light dark" : mode }}',
  );
});

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");
const document = read("../layouts/AdminDocument.astro");
const shell = read("./shell.css");
const accents = read("../themes/workspace-accents.css");
const flat = (text: string) => text.replace(/\s+/g, " ");

describe("the one admin document", () => {
  it("covers the screen, stays out of indexes and titles every page alike", () => {
    expect(document).toContain(
      'content="width=device-width, initial-scale=1, viewport-fit=cover"',
    );
    expect(document).toContain(
      '<meta name="robots" content="noindex, nofollow, noarchive" />',
    );
    expect(document).toContain("<title>{title} | Admin</title>");
    expect(document).toContain(
      '<meta name="apple-mobile-web-app-title" content="Admin" />',
    );
    expect(flat(document)).toContain(
      'rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials"',
    );
    // Every page renders through it: the layouts and the standalone pages.
    for (const page of [
      "../layouts/AdminLayout.astro",
      "../layouts/EditorialLayout.astro",
      "../pages/auth.astro",
      "../pages/auth/logout.astro",
    ]) {
      const source = read(page);
      expect(source, page).toContain("<AdminDocument");
      expect(source, page).not.toContain("<!doctype html>");
    }
  });

  it("writes one theme-color meta on the canvas colour", () => {
    expect(document.match(/name="theme-color"/g)).toHaveLength(1);
    expect(document).not.toContain("prefers-color-scheme");
    expect(flat(document)).toContain(
      'content={mode === "dark" ? ADMIN_CANVAS[1] : ADMIN_CANVAS[0]}',
    );
    expect(editorialTheme.tokens["--color-background-body"]).toBe(
      `light-dark(${ADMIN_CANVAS[0]}, ${ADMIN_CANVAS[1]})`,
    );
    const manifest = JSON.parse(read("../../public/manifest.webmanifest"));
    expect(manifest).toMatchObject({
      name: "Admin",
      display: "standalone",
      background_color: ADMIN_CANVAS[0],
      theme_color: ADMIN_CANVAS[0],
    });
  });

  it("paints html, body, main and the phone top bar on the one canvas", () => {
    const rules = blocks(shell);
    const background = (selector: string) =>
      rules
        .filter((block) => ownSelectors(block).includes(selector))
        .flatMap((block) => block.declarations)
        .filter(
          ([name]) => name === "background" || name === "background-color",
        )
        .map(([, value]) => value);
    for (const selector of ["html", "body"])
      expect(background(selector)).toEqual(["var(--color-background-body)"]);
    expect(
      background(".editorial-workspace-shell #astryx-app-shell-main"),
    ).toEqual(["var(--color-background-body)"]);
    expect(background(".admin-phone-bar")).toEqual([
      "var(--color-background-body)",
    ]);
    expect(
      background(".editorial-workspace-shell .astryx-app-shell-header"),
    ).toEqual(["var(--color-background-body)"]);
  });

  it("scrolls the document on phones under a sticky top bar and paints no bottom bar", () => {
    const compact = blocks(shell).filter((block) =>
      block.preludes.includes("@media (max-width: 640px)"),
    );
    const declarations = (selector: string) =>
      Object.fromEntries(
        compact
          .filter((block) => ownSelectors(block).includes(selector))
          .flatMap((block) => block.declarations),
      );
    expect(declarations(".editorial-workspace-shell")).toMatchObject({
      height: "auto",
      "--admin-gutter": "var(--spacing-3)",
    });
    expect(
      declarations(".editorial-workspace-shell #astryx-app-shell-main"),
    ).toMatchObject({
      height: "auto",
      overflow: "visible",
      "padding-block-end": "env(safe-area-inset-bottom)",
    });
    expect(
      declarations(".editorial-workspace-shell .astryx-app-shell-header"),
    ).toMatchObject({ position: "sticky", "inset-block-start": "0" });
    expect(declarations(".admin-phone-bar")).toMatchObject({
      "padding-block-start": "env(safe-area-inset-top)",
      "padding-inline": "var(--admin-gutter)",
    });
    // The inner scroller and its document lock start only with the sidebar.
    const lock = blocks(shell).find((block) =>
      ownSelectors(block).includes("html:has(.editorial-workspace-shell)"),
    );
    expect(lock?.preludes[0]).toBe("@media (min-width: 641px)");
    // Nothing is fixed to the bottom edge.
    expect(shell).not.toMatch(
      /inset-block-end|(?<!border-)bottom:|position:\s*fixed/,
    );
  });

  it("declares the gutter once per range and applies it once, on main", () => {
    const gutters = blocks(shell).flatMap((block) =>
      block.declarations
        .filter(([name]) => name === "--admin-gutter")
        .map(([, value]) => `${block.preludes.join(" ")} ${value}`),
    );
    expect(gutters).toEqual([
      ".editorial-workspace-shell clamp(var(--spacing-4), 3vw, var(--spacing-12))",
      "@media (max-width: 640px) .editorial-workspace-shell var(--spacing-3)",
    ]);
    const inline = (selector: string) =>
      blocks(shell)
        .filter((block) => ownSelectors(block).includes(selector))
        .flatMap((block) => block.declarations)
        .filter(([name]) => name === "padding-inline")
        .map(([, value]) => value);
    expect(inline(".editorial-workspace-shell #astryx-app-shell-main")).toEqual(
      ["var(--admin-gutter)"],
    );
    for (const frame of [
      ".editorial-workspace-shell .admin-page-frame",
      ".editorial-content",
    ])
      expect(inline(frame), frame).toEqual(["0"]);
  });
});

// Accent text on its own surfaces, in [light, dark].
function pair(value: unknown): [string, string] {
  const match = /^light-dark\((#[\da-f]{6}), (#[\da-f]{6})\)$/i.exec(
    String(value),
  );
  if (!match) throw new Error(`not a light-dark pair: ${String(value)}`);
  return [match[1]!, match[2]!];
}
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}

describe("workspace accents", () => {
  const sets = blocks(accents).map((block) => ({
    selectors: ownSelectors(block),
    tokens: Object.fromEntries(block.declarations),
  }));

  it("declares one token set per workspace, and no theme file of its own", () => {
    expect(sets.map(({ selectors }) => selectors)).toEqual([
      [
        ':root[data-admin-workspace="life"]',
        ':root[data-admin-workspace="life"] [data-astryx-theme]',
      ],
      [
        ':root[data-admin-workspace="operations"]',
        ':root[data-admin-workspace="operations"] [data-astryx-theme]',
      ],
    ]);
    for (const { tokens } of sets)
      expect(Object.keys(tokens).sort()).toEqual([
        "--color-accent",
        "--color-accent-muted",
        "--color-on-accent",
      ]);
    expect(
      readdirSync(new URL("../themes/", import.meta.url)).filter(
        (name) => name.endsWith(".ts") && !name.endsWith(".d.ts"),
      ),
    ).toEqual(["editorial.ts"]);
    expect(unswitchedRootColors(accents)).toEqual([]);
    expect(document).toContain('import "../themes/workspace-accents.css";');
    expect(document).toContain("data-admin-workspace={workspace ?? undefined}");
  });

  it("keeps each accent readable on the sidebar, its tint and the document", () => {
    const base = editorialTheme.tokens;
    const content = {
      "--color-accent": base["--color-accent"],
      "--color-accent-muted": base["--color-accent-muted"],
      "--color-on-accent": base["--color-on-accent"],
    };
    const sidebar = pair(
      editorialTheme.components?.["app-shell"]?.base?.[
        "--color-workspace-sidebar"
      ],
    );
    for (const tokens of [content, ...sets.map((set) => set.tokens)]) {
      const accent = pair(tokens["--color-accent"]);
      const onAccent = pair(tokens["--color-on-accent"]);
      for (const surface of [
        sidebar,
        pair(tokens["--color-accent-muted"]),
        pair(base["--color-background-surface"]),
        pair(base["--color-background-body"]),
      ])
        for (const mode of [0, 1])
          expect(
            contrast(accent[mode]!, surface[mode]!),
          ).toBeGreaterThanOrEqual(4.5);
      for (const mode of [0, 1])
        expect(contrast(accent[mode]!, onAccent[mode]!)).toBeGreaterThanOrEqual(
          4.5,
        );
    }
  });
});
