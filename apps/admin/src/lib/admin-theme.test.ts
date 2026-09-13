import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adminThemePrepaintScript,
  initialAdminTheme,
  prepaintAdminTheme,
  savedTheme,
  saveTheme,
} from "./admin-theme";
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
