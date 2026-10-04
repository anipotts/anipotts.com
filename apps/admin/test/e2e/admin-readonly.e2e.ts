import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// The ordinary loopback dev preview permits these GET routes. It cannot issue
// credentials or write drafts, so this suite is safe for an anonymous runner.
test("project library search opens a committed record", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/content/projects");

  await expect(
    screen.getByRole("table", { name: "Projects records" }),
  ).toBeVisible();
  await expect
    .poll(
      () =>
        browser.evaluate(
          () =>
            document
              .querySelector('astro-island[component-url*="EditorialApp"]')
              ?.hasAttribute("ssr") === false,
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
  const search = screen.getByRole("textbox", { name: "Search projects" });
  await search.fill("chainedchat");
  const record = screen.getByRole("link", { name: /chainedchat/i });
  await expect(record).toBeVisible();
  await record.click();

  await expect(
    screen.getByRole("heading", { name: "chainedchat", level: 1 }),
  ).toBeVisible();
});

test("project library shows a real no-match state", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/content/projects");
  await expect
    .poll(
      () =>
        browser.evaluate(
          () =>
            document
              .querySelector('astro-island[component-url*="EditorialApp"]')
              ?.hasAttribute("ssr") === false,
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
  await screen
    .getByRole("textbox", { name: "Search projects" })
    .fill("no-such-project-7f4e9a");

  await expect(
    screen.getByRole("heading", { name: "No matching records" }),
  ).toBeVisible();
  await expect(
    screen.getByRole("table", { name: "Projects records" }),
  ).not.toBeVisible();
});

test("operations and data distinguish synthetic samples from disconnected readers", async ({
  app,
  screen,
}) => {
  await app.open("/observability/status?fixture=synthetic");
  await expect(screen.getByText("Sample data", { exact: true })).toBeVisible();
  await expect(
    screen.getByText("inference not ok", { exact: true }),
  ).toBeVisible();

  await app.open("/observability/status?fixture=none");
  await expect(
    screen.getByRole("heading", { name: "Credential not issued" }),
  ).toBeVisible({ timeout: 20_000 });

  await app.open("/data/records?fixture=synthetic");
  await expect(screen.getByText("Sample data", { exact: true })).toBeVisible();
  await expect(
    screen.getByText("Sample person: Robin Example", { exact: true }),
  ).toBeVisible();

  await app.open("/data/records?fixture=none");
  await expect(
    screen.getByRole("heading", { name: "Credential not issued" }),
  ).toBeVisible({ timeout: 20_000 });
});

test("private inventory failure offers a reload path", async ({
  app,
  screen,
}) => {
  await app.open("/content/projects?fixture=error");

  await expect(
    screen.getByText("Private drafts couldn’t be loaded"),
  ).toBeVisible();
  await expect(screen.getByRole("button", { name: "Reload" })).toBeVisible();
});
