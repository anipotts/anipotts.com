import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// Local opt-in only. This goal explores the UI, but the concrete assertion is
// the pass condition. Use a loopback owner preview with committed seed data.
test("find a project from its library", async ({ app, agent, screen }) => {
  await app.open("/content/projects");

  await agent.act(
    "From the Projects library, use the visible controls to find the project named chainedchat and open its record. Do not edit, save, publish, or leave this local admin app.",
  );

  await expect(
    screen.getByRole("heading", { name: "chainedchat", level: 1 }),
  ).toBeVisible();
});
