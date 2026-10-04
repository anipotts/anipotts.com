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
