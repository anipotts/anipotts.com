import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// Run against the built public Worker with a seeded local D1. The runner's
// public config supplies the loopback base URL and desktop/mobile projects.
test("primary navigation reaches the public catalogs", async ({
  app,
  screen,
  browser,
}) => {
  await app.open("/");

  const primary = screen.getByRole("navigation", { name: "primary" });
  const narrow = (await browser.evaluate(() => window.innerWidth)) < 600;
  if (narrow)
    await screen.getByRole("button", { name: "toggle navigation" }).click();
  await primary.getByRole("link", { name: "work" }).click();
  await expect(browser).toHaveURL("/work");
  await expect(
    screen.getByRole("heading", { name: "work", level: 1 }),
  ).toBeVisible();
  if (narrow)
    await screen.getByRole("button", { name: "toggle navigation" }).click();
  await expect(primary.getByRole("link", { name: "work" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await primary.getByRole("link", { name: "writing" }).click();
  await expect(browser).toHaveURL("/writing");
  await expect(
    screen.getByRole("heading", { name: "writing", level: 1 }),
  ).toBeVisible();
  if (narrow)
    await screen.getByRole("button", { name: "toggle navigation" }).click();
  await expect(primary.getByRole("link", { name: "writing" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("a published article is discoverable from writing", async ({
  app,
  screen,
  browser,
}) => {
  await app.open("/writing");
  await screen
    .getByRole("link", { name: /awareness is really alpha/i })
    .click();

  await expect(browser).toHaveURL("/writing/awareness-is-alpha");
  await expect(
    screen.getByRole("heading", {
      name: "awareness is really alpha",
      level: 1,
    }),
  ).toBeVisible();
  await expect(screen.getByRole("link", { name: "all writing" })).toBeVisible();
});

test("a published project is discoverable from work", async ({
  app,
  screen,
  browser,
}) => {
  await app.open("/work");
  await screen.getByRole("link", { name: /quantercise/i }).click();

  await expect(browser).toHaveURL("/work/quantercise");
  await expect(
    screen.getByRole("heading", { name: "quantercise", level: 1 }),
  ).toBeVisible();
});

test("the narrow-screen menu opens, navigates, and closes", async ({
  app,
  screen,
  browser,
}) => {
  await app.open("/");
  test.skip(
    (await browser.evaluate(() => window.innerWidth)) > 600,
    "narrow layout only",
  );

  const toggle = screen.getByRole("button", { name: "toggle navigation" });
  const primary = screen.getByRole("navigation", { name: "primary" });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(primary.getByRole("link", { name: "systems" })).toBeVisible();

  await primary.getByRole("link", { name: "systems" }).click();
  await expect(browser).toHaveURL("/systems");
  await expect(
    screen.getByRole("heading", { name: "systems", level: 1 }),
  ).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("skip navigation moves keyboard focus into content before and after a client transition", async ({
  app,
  screen,
  browser,
}) => {
  await app.open("/");
  const skip = screen.getByRole("link", {
    name: "skip to content",
    exact: true,
  });
  const main = screen.getByRole("main");
  // macOS WebKit's default Tab preference skips links. Option-Tab follows the
  // complete native link sequence, without changing focus or browser settings.
  // https://support.apple.com/guide/safari/cpsh003/mac
  const macWebKit = await browser.evaluate(() => {
    const agent = navigator.userAgent;
    return (
      agent.includes("Macintosh") &&
      agent.includes("Safari/") &&
      !/Chrome\/|Chromium\/|Edg\//.test(agent)
    );
  });
  const forwardTab = macWebKit ? "Alt+Tab" : "Tab";
  const backwardTab = macWebKit ? "Alt+Shift+Tab" : "Shift+Tab";
  await browser.keyboard.press(forwardTab);
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  expect(
    await browser.evaluate(() => {
      const link = document.querySelector<HTMLAnchorElement>(".skip-link")!;
      const box = link.getBoundingClientRect();
      return (
        getComputedStyle(link).clipPath === "none" &&
        box.top >= 0 &&
        box.left >= 0 &&
        box.right <= innerWidth &&
        box.bottom <= innerHeight &&
        document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        ) === link
      );
    }),
  ).toBe(true);
  await browser.keyboard.press("Enter");
  await expect(main).toBeFocused();
  await browser.keyboard.press(forwardTab);
  expect(
    await browser.evaluate(() =>
      document.querySelector("main")!.contains(document.activeElement),
    ),
  ).toBe(true);

  const timeOrigin = await browser.evaluate(() => performance.timeOrigin);
  if ((await browser.evaluate(() => innerWidth)) < 600)
    await screen.getByRole("button", { name: "toggle navigation" }).click();
  await screen
    .getByRole("navigation", { name: "primary" })
    .getByRole("link", { name: "work", exact: true })
    .click();
  await expect(browser).toHaveURL("/work");
  await expect(
    screen.getByRole("heading", { name: "work", level: 1 }),
  ).toBeVisible();
  expect(await browser.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  // The persisted home link is the first navigation control. Moving back one
  // tab stop must reach the new page's skip link after the document swap.
  await screen
    .getByRole("banner")
    .getByRole("link", { name: "home", exact: true })
    .press(backwardTab);
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await browser.keyboard.press("Enter");
  await expect(main).toBeFocused();
  await browser.keyboard.press(forwardTab);
  expect(
    await browser.evaluate(() =>
      document.querySelector("main")!.contains(document.activeElement),
    ),
  ).toBe(true);
});

test("pages and long code blocks retain native scroll indicators and scrolling", async ({
  app,
  browser,
}) => {
  await app.open("/writing/awareness-is-alpha");
  expect(
    await browser.evaluate(() => {
      const body = document.querySelector<HTMLElement>(".article-body")!;
      // Exercise the real article code-block styles with deterministic overflow;
      // the fixture lives only in this browser document, never in CMS content.
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = "long_code_fixture_".repeat(120);
      pre.append(code);
      body.append(pre);
      const scrollable = (element: Element) => {
        const style = getComputedStyle(element);
        const scrollbar = getComputedStyle(element, "::-webkit-scrollbar");
        return (
          style.scrollbarWidth !== "none" &&
          scrollbar.display !== "none" &&
          scrollbar.width !== "0px" &&
          scrollbar.height !== "0px"
        );
      };
      pre.scrollLeft = 80;
      window.scrollTo(0, 100);
      const result =
        scrollable(document.documentElement) &&
        scrollable(document.body) &&
        scrollable(pre) &&
        getComputedStyle(pre).overflowX === "auto" &&
        pre.scrollWidth > pre.clientWidth &&
        pre.scrollLeft > 0 &&
        window.scrollY > 0;
      pre.remove();
      return result;
    }),
  ).toBe(true);
});

test("an article's authored source is exposed beside its introduction", async ({
  app,
  screen,
}) => {
  await app.open("/writing/saturdays-are-for-claude-code");
  const source = screen.getByRole("link", {
    name: "source (opens in new tab)",
    exact: true,
  });
  await expect(source).toBeVisible();
  await expect(source).toHaveAttribute(
    "href",
    "https://www.businessinsider.com/ai-usage-limits-causing-some-to-restructure-their-workday-2026-4",
  );
  await expect(source).toHaveAttribute("target", "_blank");
  await expect(source).toHaveAttribute("rel", "noopener noreferrer");
});
