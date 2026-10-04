import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// Run only with `pnpm dev:admin:owner` on loopback. A network route refuses
// save requests before they reach the local Durable Object, so this exercises
// browser recovery without changing even the local editorial inventory.
test("an interrupted project edit is recovered for review", async ({
  app,
  browser,
  screen,
}) => {
  await browser.route(/\/api\/editorial\/save\?/, async (route) => {
    await route.fulfill({
      status: 503,
      json: { error: "synthetic_save_failure" },
    });
  });
  await app.open("/content/projects/chainedchat");

  const title = screen.getByRole("textbox", "Title");
  await expect(title).toBeVisible({ timeout: 20_000 });
  await title.fill("e2e interrupted project edit");
  await expect(
    screen.getByRole("heading", "e2e interrupted project edit", { level: 1 }),
  ).toBeVisible();
  await expect
    .poll(() =>
      browser.evaluate(() =>
        Object.keys(localStorage).some((key) =>
          key.startsWith("editorial-recovery:v2:"),
        ),
      ),
    )
    .toBe(true);

  // Navigation is intentional here: the browser buffer must survive a reload.
  const offDialog = await browser.onDialog("accept");
  await browser.reload();
  await offDialog();

  await expect(
    screen.getByText("Recovered edits are ready to review"),
  ).toBeVisible();
  await expect(screen.getByRole("textbox", "Title")).toHaveValue(
    "e2e interrupted project edit",
  );
});
