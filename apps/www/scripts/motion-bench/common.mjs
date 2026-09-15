// Shared setup for the writing motion bench. Dev only, never run in CI.
import { createRequire } from "node:module";

// Playwright is a workspace dev dependency of the admin app; resolve it from
// there so the public site does not carry a browser dependency.
const require = createRequire(
  process.env.PLAYWRIGHT_FROM ||
    new URL("../../../admin/package.json", import.meta.url),
);
export const { chromium, devices, webkit } = require("@playwright/test");

const desktopAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

export function profiles(theme = "dark") {
  return [
    {
      name: "desktop-1280",
      context: {
        viewport: { width: 1280, height: 800 },
        userAgent: desktopAgent,
        colorScheme: theme,
      },
      cpu: 1,
      tap: false,
    },
    {
      name: "mobile-390-4x",
      context: {
        ...devices["iPhone 13"],
        viewport: { width: 390, height: 844 },
        colorScheme: theme,
      },
      cpu: 4,
      tap: true,
    },
  ];
}

export const STEPS = ["expand", "collapse", "expand-2", "collapse-back-button"];

/** Runs the four bench steps on a page at /writing: open the first card,
 * close with the back link, open again, close with browser back. */
export async function runSteps(page, tap, capture) {
  const card = "a.writing-card";
  const act = (selector) => (tap ? page.tap(selector) : page.click(selector));
  await capture("expand", card, () => act(card));
  await page.waitForTimeout(800);
  await page.waitForSelector(".back");
  await capture("collapse", ".back", () => act(".back"));
  await page.waitForTimeout(600);
  await capture("expand-2", card, () => act(card));
  await page.waitForTimeout(800);
  await capture("collapse-back-button", null, () => page.goBack());
}

export function option(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === "") {
    if (fallback === undefined) throw new Error(`${name} is required`);
    return fallback;
  }
  return value;
}
