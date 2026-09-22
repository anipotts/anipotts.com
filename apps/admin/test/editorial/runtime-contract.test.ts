/// <reference types="@cloudflare/vitest-plugin/types" />
import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";

const record = { kind: "page", id: "home" } as const;

// Alarms and RPC both construct the object, so the constructor is the one
// Durable Object entry that bypasses the Worker fetch wrapper.
it("reports the runtime contract once from Durable Object entries without blocking", async () => {
  const info = vi.spyOn(console, "info");
  const warn = vi.spyOn(console, "warn");
  const first = env.EDITORIAL.getByName(crypto.randomUUID());
  expect(await first.latestDirectPublication(record)).toBeNull();
  const second = env.EDITORIAL.getByName(crypto.randomUUID());
  await runInDurableObject(second, (_instance, state) =>
    state.storage.setAlarm(Date.now() + 60_000),
  );
  expect(await runDurableObjectAlarm(second)).toBe(true);
  const lines = [...info.mock.calls, ...warn.mock.calls]
    .map(([line]) => String(line))
    .filter((line) => line.includes('"runtime_contract"'));
  expect(lines).toHaveLength(1);
  // The storage test Worker binds only EDITORIAL.
  expect(JSON.parse(lines[0] ?? "null")).toMatchObject({
    event: "runtime_contract",
    app: "admin",
    entry: "durable_object",
    ok: false,
    missing: ["ASSETS", "ACCESS_TEAM_DOMAIN", "ACCESS_POLICY_AUD"],
    features: { editorial: { state: "disabled", missing: [] } },
  });
});
