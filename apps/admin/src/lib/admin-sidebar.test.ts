import { buildSync } from "esbuild";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  RAIL_QUERY,
  adminSidebarPrepaintScript,
  savedSidebarCollapsed,
  sidebarGroupsState,
  sidebarRail,
  workspaceForPath,
} from "./admin-sidebar";

const storage = (values: Record<string, string>) => ({
  getItem: (key: string) => values[key] ?? null,
});
const inRailRange = (width: number) => width >= 641 && width <= 1279;

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
  it("has no sidebar at compact widths and follows a saved choice from 641px", () => {
    expect(RAIL_QUERY).toBe("(min-width: 641px) and (max-width: 1279px)");
    expect(sidebarRail(390, true, false)).toBe(false);
    expect(sidebarRail(640, true, false)).toBe(false);
    expect(sidebarRail(641, null, true)).toBe(true);
    expect(sidebarRail(768, true, true)).toBe(true);
    expect(sidebarRail(1024, false, true)).toBe(false);
    expect(sidebarRail(1440, true, false)).toBe(true);
    expect(sidebarRail(1440, null, false)).toBe(false);
  });

  it("keeps the overview workspace-neutral", () => {
    expect(workspaceForPath("/")).toBeNull();
    expect(workspaceForPath("/content/writing")).toBe("content");
    expect(workspaceForPath("/newsletter/issue")).toBe("content");
    expect(workspaceForPath("/data/records/rec-1")).toBe("life");
    expect(workspaceForPath("/observability/alerts")).toBe("operations");
    expect(workspaceForPath("/proof")).toBe("operations");
    expect(workspaceForPath("/404")).toBeNull();
    // Nothing is forced open on a neutral page.
    expect(sidebarGroupsState('{"content":true}', null).content).toBe(true);
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
      for (const width of [390, 640, 641, 768, 1024, 1279, 1280, 1440])
        for (const values of <Record<string, string>[]>[
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

  it("prepaints the closed groups the sidebar will show, never the active one", () => {
    const run = (path: string, raw?: string) => {
      const root = { dataset: {} as Record<string, string> };
      runInNewContext(adminSidebarPrepaintScript, {
        window: {
          innerWidth: 1280,
          location: { pathname: path },
          matchMedia: () => ({ matches: false }),
        },
        localStorage: storage(raw ? { "admin:sidebar-groups": raw } : {}),
        document: { documentElement: root },
      });
      return root.dataset.adminNavClosed;
    };
    const closed = '{"content":true,"life":true,"operations":false}';
    expect(run("/content/pages")).toBeUndefined();
    expect(run("/content/writing", closed)).toBe("life");
    expect(run("/data/records", closed)).toBe("content");
    expect(
      run("/data/records/rec-00000000000000000000000000000001", closed),
    ).toBe("content");
    expect(run("/observability/status", closed)).toBe("content life");
    // The overview and retired Life URLs belong to no workspace, so every
    // saved choice holds; retired Life URLs redirect before rendering.
    expect(run("/", closed)).toBe("content life");
    expect(run("/life/people", closed)).toBe("content life");
    expect(run("/content/newsletter", "not json")).toBeUndefined();
    for (const path of ["/content/pages", "/data/sources", "/", "/proof"]) {
      const expected = Object.entries(
        sidebarGroupsState(closed, workspaceForPath(path)),
      )
        .filter(([, value]) => value)
        .map(([id]) => id)
        .join(" ");
      expect(run(path, closed) ?? "").toBe(expected);
    }
  });

  it("runs the prepaint in the one document and holds rail geometry only before hydration", () => {
    const document = readFileSync(
      new URL("../layouts/AdminDocument.astro", import.meta.url),
      "utf8",
    );
    expect(document).toContain(
      "<script is:inline set:html={adminSidebarPrepaintScript} />",
    );
    for (const layout of ["EditorialLayout", "AdminLayout"])
      expect(
        readFileSync(
          new URL(`../layouts/${layout}.astro`, import.meta.url),
          "utf8",
        ),
      ).toContain('import AdminDocument from "./AdminDocument.astro";');
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
