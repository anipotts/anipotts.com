import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// Opt-in local pilot: the agent chooses a visible route; the outcome remains
// a deterministic assertion. Do not add this file to the PR CI selection.
test("find writing about awareness in agent work", async ({
  app,
  agent,
  screen,
}) => {
  await app.open("/");
  await agent.act(
    "using the visible site navigation and article links, find and open ani's writing about awareness when working with agents",
  );

  await expect(
    screen.getByRole("heading", {
      name: "awareness is really alpha",
      level: 1,
    }),
  ).toBeVisible();
});
