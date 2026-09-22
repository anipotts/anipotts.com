import { buildSync } from "esbuild";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_CANVAS,
  adminThemePrepaintScript,
  initialAdminTheme,
  nextTheme,
  prepaintAdminTheme,
  savedTheme,
  saveTheme,
} from "./admin-theme";
import { editorialTheme } from "../themes/editorial.js";

/** The one theme-color meta, as the document writes it. */
function themeColorMeta() {
  const meta = { content: "#ffffff" };
  return {
    meta,
    querySelector: (selector: string) =>
      selector === 'meta[name="theme-color"]'
        ? {
            setAttribute: (name: string, value: string) => {
              if (name === "content") meta.content = value;
            },
          }
        : null,
  };
}
function setup(query = "", cookie = "", stored: Record<string, string> = {}) {
  vi.stubGlobal(
    "location",
    new URL(`https://admin.anipotts.com/content${query}`),
  );
  vi.stubGlobal("document", {
    cookie,
    documentElement: {
      dataset: { theme: "light" },
      style: { colorScheme: "light" },
    },
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored[key] ?? null,
    setItem: vi.fn(),
  });
  vi.stubGlobal("history", { state: null, replaceState: vi.fn() });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
}
afterEach(() => vi.unstubAllGlobals());
describe("admin appearance precedence", () => {
  it.each([
    ["?theme=dark", "ap-theme=light", { theme: "light" }, "dark"],
    ["?theme=invalid", "ap-theme=dark", { theme: "light" }, "dark"],
    ["", "ap-theme=system", { theme: "light" }, "system"],
    ["", "ap-theme=%64ark", { theme: "light" }, "dark"],
    ["", "", { theme: "dark" }, "dark"],
    ["", "", { theme: "invalid", "admin-theme:v1": "dark" }, "dark"],
    ["", "", {}, "system"],
  ])(
    "resolves first valid source consistently: %s %s",
    (query, cookie, stored, expected) => {
      setup(query, cookie, stored);
      expect(prepaintAdminTheme()).toBe(expected);
      new Function(adminThemePrepaintScript)();
      expect(document.documentElement.style.colorScheme).toBe(
        expected === "system" ? "light dark" : expected,
      );
      expect(document.documentElement.dataset.theme).toBe(
        expected === "system" ? undefined : expected,
      );
      expect(savedTheme()).toBe(expected);
    },
  );
  it("SSR ignores invalid URL values instead of masking the cookie", () => {
    expect(initialAdminTheme("invalid", "dark")).toBe("dark");
    expect(initialAdminTheme(undefined, undefined)).toBe("system");
  });
  it("uses system without storage and removes a stale fixed-mode attribute", () => {
    setup();
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("disabled");
      },
      setItem() {
        throw new Error("disabled");
      },
    });
    expect(savedTheme()).toBe("system");
    saveTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    saveTheme("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.style.colorScheme).toBe("light dark");
  });
});

it("runs the production-bundled prepaint script without bundler globals", () => {
  const bundled = buildSync({
    entryPoints: [fileURLToPath(new URL("./admin-theme.ts", import.meta.url))],
    bundle: true,
    write: false,
    platform: "browser",
    format: "cjs",
    keepNames: true,
    minify: true,
    target: "es2022",
  });
  const compiledModule = {
    exports: {} as { adminThemePrepaintScript?: string },
  };
  runInNewContext(bundled.outputFiles[0]!.text, { module: compiledModule });
  const script = compiledModule.exports.adminThemePrepaintScript!;
  for (const [query, cookie, stored, expected] of [
    ["?theme=dark", "ap-theme=light", {}, "dark"],
    ["?theme=invalid", "ap-theme=dark", {}, "dark"],
    ["", "", { theme: "light" }, "light"],
    ["", "ap-theme=%invalid", { "admin-theme:v1": "dark" }, "dark"],
    ["", "", {}, "system"],
  ] as const) {
    setup(query, cookie, stored);
    const { meta, querySelector } = themeColorMeta();
    Object.assign(document, { querySelector });
    // A separate browser context has no esbuild __name helper from the Worker.
    runInNewContext(script, {
      URL,
      location,
      document,
      localStorage,
      matchMedia: () => ({ matches: false }),
    });
    expect(meta.content).toBe(
      expected === "dark" ? ADMIN_CANVAS[1] : ADMIN_CANVAS[0],
    );
    expect(document.documentElement.dataset.theme).toBe(
      expected === "system" ? undefined : expected,
    );
    expect(document.documentElement.style.colorScheme).toBe(
      expected === "system" ? "light dark" : expected,
    );
  }
});

describe("status bar colour", () => {
  it("reads the canvas from the editorial theme's body colour", () => {
    expect(editorialTheme.tokens["--color-background-body"]).toBe(
      `light-dark(${ADMIN_CANVAS[0]}, ${ADMIN_CANVAS[1]})`,
    );
  });

  it.each([
    ["ap-theme=light", false, ADMIN_CANVAS[0]],
    ["ap-theme=dark", false, ADMIN_CANVAS[1]],
    ["ap-theme=system", false, ADMIN_CANVAS[0]],
    ["ap-theme=system", true, ADMIN_CANVAS[1]],
  ] as const)(
    "prepaints and saves the canvas colour for %s (system dark: %s)",
    (cookie, systemDark, expected) => {
      setup("", cookie);
      const { meta, querySelector } = themeColorMeta();
      Object.assign(document, { querySelector });
      vi.stubGlobal("matchMedia", () => ({ matches: systemDark }));
      new Function(adminThemePrepaintScript)();
      expect(meta.content).toBe(expected);
      meta.content = "#ffffff";
      const preference = cookie.slice("ap-theme=".length) as
        "light" | "dark" | "system";
      saveTheme(preference);
      expect(meta.content).toBe(expected);
    },
  );

  it("cycles light, dark and system", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
    expect(nextTheme("system")).toBe("light");
  });
});
