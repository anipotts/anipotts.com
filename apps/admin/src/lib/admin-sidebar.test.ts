import { buildSync } from "esbuild";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  RAIL_QUERY,
  adminSidebarPrepaintScript,
  savedSidebarCollapsed,
  sidebarRail,
} from "./admin-sidebar";

const storage = (values: Record<string, string>) => ({
  getItem: (key: string) => values[key] ?? null,
});
const inRailRange = (width: number) => width >= 769 && width <= 1279;

/** Runs the serialized script the way the browser does, in a bare context. */
function prepaint(
  script: string,
  width: number,
  values: Record<string, string>,
) {
  const root = { dataset: {} as Record<string, string> };
  runInNewContext(script, {
    window: {
      innerWidth: width,
      matchMedia: (query: string) => {
        expect(query).toBe(RAIL_QUERY);
        return { matches: inRailRange(width) };
      },
    },
    localStorage: storage(values),
    document: { documentElement: root },
  });
  return root.dataset.adminSidebar;
}

describe("sidebar rail choice", () => {
  it("never shows the rail in the drawer range and follows a saved choice above it", () => {
    expect(sidebarRail(768, true, false)).toBe(false);
    expect(sidebarRail(769, null, true)).toBe(true);
    expect(sidebarRail(1024, false, true)).toBe(false);
    expect(sidebarRail(1440, true, false)).toBe(true);
    expect(sidebarRail(1440, null, false)).toBe(false);
  });

  it("reads the current key first, then the earlier one, and ignores junk", () => {
    expect(savedSidebarCollapsed(storage({}))).toBeNull();
    expect(
      savedSidebarCollapsed(
        storage({
          "admin:sidebar-collapsed": "false",
          "editorial:sidebar-collapsed": "true",
        }),
      ),
    ).toBe(false);
    expect(
      savedSidebarCollapsed(storage({ "editorial:sidebar-collapsed": "true" })),
    ).toBe(true);
    expect(
      savedSidebarCollapsed(storage({ "admin:sidebar-collapsed": "maybe" })),
    ).toBeNull();
    expect(
      savedSidebarCollapsed({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBeNull();
  });

  it("prepaints the same choice the shell makes, from the bundled script", () => {
    // Bundle and minify like the Worker build, so helpers that would escape
    // into the serialized function fail here instead of in production.
    const bundled = buildSync({
      entryPoints: [
        fileURLToPath(new URL("./admin-sidebar.ts", import.meta.url)),
      ],
      bundle: true,
      write: false,
      platform: "browser",
      format: "cjs",
      keepNames: true,
      minify: true,
      target: "es2022",
    });
    const compiled = { exports: {} as { adminSidebarPrepaintScript?: string } };
    runInNewContext(bundled.outputFiles[0]!.text, { module: compiled });
    for (const script of [
      adminSidebarPrepaintScript,
      compiled.exports.adminSidebarPrepaintScript!,
    ])
      for (const width of [390, 768, 769, 1024, 1279, 1280, 1440])
        for (const values of [
          {},
          { "admin:sidebar-collapsed": "true" },
          { "admin:sidebar-collapsed": "false" },
          { "editorial:sidebar-collapsed": "true" },
        ]) {
          const expected = sidebarRail(
            width,
            savedSidebarCollapsed(storage(values)),
            inRailRange(width),
          )
            ? "rail"
            : "full";
          expect(
            prepaint(script, width, values),
            `${width} ${JSON.stringify(values)}`,
          ).toBe(expected);
        }
  });

  it("runs the prepaint in both layouts and holds rail geometry only before hydration", () => {
    for (const layout of ["EditorialLayout", "AdminLayout"]) {
      const source = readFileSync(
        new URL(`../layouts/${layout}.astro`, import.meta.url),
        "utf8",
      );
      expect(source).toContain(
        "<script is:inline set:html={adminSidebarPrepaintScript} />",
      );
    }
    const css = readFileSync(
      new URL("../components/astryx/WorkspaceHeader.css", import.meta.url),
      "utf8",
    ).replace(/\s+/g, " ");
    for (const target of [
      ".astryx-app-shell-sidenav { width: calc(var(--spacing-9) + var(--spacing-2) * 2); transition: none; }",
      ".editorial-workspace-nav > * { visibility: hidden; }",
      "#astryx-app-shell-main { height: 100%; margin-block-start: 0; border-radius: 0; transition: none; }",
    ])
      expect(css).toContain(
        `:root[data-admin-sidebar="rail"] .editorial-workspace-shell[data-sidebar-ready="false"] ${target}`,
      );
  });
});
