import { afterEach, describe, expect, it, vi } from "vitest";
import {
  savedTheme,
  saveTheme,
  themedUrl,
  resolvedTheme,
} from "@anipotts/brand/theme";

function browser(url = "http://localhost:4311/content") {
  vi.stubGlobal("location", new URL(url));
  vi.stubGlobal("document", { cookie: "", documentElement: { dataset: {} } });
  vi.stubGlobal("history", { state: null, replaceState: vi.fn() });
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
}
afterEach(() => vi.unstubAllGlobals());
describe("owner browser theme continuity", () => {
  it("carries only a theme preference across local origins", () => {
    browser();
    expect(themedUrl("http://anipotts.localhost:1355/", "dark")).toBe(
      "http://anipotts.localhost:1355/?theme=dark",
    );
  });
  it("accepts and consumes the explicit theme on arrival", () => {
    browser("http://localhost:4311/content?group=work&theme=dark");
    expect(savedTheme()).toBe("dark");
    expect(history.replaceState).toHaveBeenCalled();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
  it("keeps production preference cookies on the site domain", () => {
    browser("https://admin.anipotts.com/content");
    saveTheme("system");
    expect(document.cookie).toContain("Domain=anipotts.com");
    expect(document.cookie).toContain("; Secure");
    expect(resolvedTheme("system")).toBe("dark");
  });
  it("does not set a production domain for a local preview", () => {
    browser();
    saveTheme("light");
    expect(document.cookie).not.toContain("Domain=");
  });
  it("rejects arbitrary theme input and works without storage", () => {
    browser("http://localhost:4311/content?theme=anything");
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("disabled");
      },
      setItem() {
        throw new Error("disabled");
      },
    });
    expect(savedTheme()).toBe("light");
    expect(() => saveTheme("dark")).not.toThrow();
  });
});
