import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// fonts.css is the only admin font declaration, and every face is `optional`,
// so a page never repaints in a different font after its first paint. The
// preload list must name files the faces actually use.
const stylesDir = new URL(".", import.meta.url).pathname;
const srcDir = join(stylesDir, "..");
const css = readFileSync(join(stylesDir, "fonts.css"), "utf8");
const preloads = readFileSync(join(srcDir, "lib", "admin-fonts.ts"), "utf8");

type Face = Record<string, string>;

function faces(source: string): Face[] {
  const found: Face[] = [];
  const blocks = source.matchAll(/@font-face\s*\{([^}]*)\}/g);
  for (const [, body] of blocks) {
    const face: Face = {};
    for (const declaration of body.split(";")) {
      const colon = declaration.indexOf(":");
      if (colon < 0) continue;
      face[declaration.slice(0, colon).trim()] = declaration
        .slice(colon + 1)
        .replace(/\s+/g, " ")
        .trim();
    }
    found.push(face);
  }
  return found;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((path) => /\.(css|astro|tsx?|mjs)$/.test(path))
    .filter((path) => !/\.test\.[cm]?[jt]sx?$/.test(path))
    .map((path) => join(dir, path));
}

describe("admin fonts", () => {
  const declared = faces(css);

  it("declares every admin face once with font-display optional", () => {
    expect(declared.map((face) => face["font-family"])).toEqual([
      '"Instrument Sans Variable"',
      '"Instrument Sans Variable"',
      '"JetBrains Mono Variable"',
      '"JetBrains Mono Variable"',
      '"AP Structural"',
    ]);
    for (const face of declared) {
      expect(face["font-display"], face["font-family"]).toBe("optional");
      expect(face.src, face["font-family"]).toMatch(/\.woff2"\)/);
    }
  });

  it("is the only font declaration under src", () => {
    const offenders = sourceFiles(srcDir).filter((path) => {
      if (path.endsWith("/styles/fonts.css")) return false;
      const text = readFileSync(path, "utf8");
      // A bare @fontsource import loads the package stylesheet and its `swap` faces.
      return /@font-face|@fontsource-variable\/[a-z-]+"|brand\/public\.css/.test(
        text,
      );
    });
    expect(offenders).toEqual([]);
  });

  it("preloads files that the faces use", () => {
    const preloaded = [...preloads.matchAll(/from "([^"]+\.woff2)\?url"/g)].map(
      ([, path]) => path,
    );
    const sources = declared.map(
      (face) => /url\("([^"]+)"\)/.exec(face.src)?.[1],
    );
    expect(preloaded).toEqual([
      "@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2",
      "@anipotts/brand/ap-structural/fonts/APStructuralDisplayBlack-v0.2.0-candidate.1.woff2",
    ]);
    for (const path of preloaded) expect(sources).toContain(path);
  });
});
