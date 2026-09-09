/// <reference types="@cloudflare/vitest-plugin/types" />
import { env } from "cloudflare:workers";
import {
  runInDurableObject,
  runDurableObjectAlarm,
  evictDurableObject,
} from "cloudflare:test";
import { expect, it } from "vitest";
import { PublicationJobs } from "../../src/editorial/publication-jobs";
import { publicationAlarm } from "../../src/editorial/publication-alarm";
import { GitHubFailure } from "../../src/editorial/github";

it("persists a stale publication block without repeating provider work", async () => {
  const stub = env.EDITORIAL.getByName(crypto.randomUUID());
  const now = Date.now();
  await runInDurableObject(stub, async (_instance, state) => {
    const jobs = new PublicationJobs(state.storage);
    jobs.enqueue("first", now);
    await publicationAlarm(
      state.storage,
      jobs,
      async () => {
        throw new GitHubFailure("publication_base_changed");
      },
      () => now,
    );
  });
  await evictDurableObject(stub);
  await runInDurableObject(stub, async (_instance, state) => {
    const jobs = new PublicationJobs(state.storage);
    expect(jobs.get("first")?.blocked).toBe("publication_base_changed");
    let calls = 0;
    await publicationAlarm(
      state.storage,
      jobs,
      async () => {
        calls++;
        return {};
      },
      () => now + 120_000,
    );
    expect(calls).toBe(0);
    expect(jobs.nextWake(now + 120_000)).toBeNull();
    await state.storage.deleteAlarm();
  });
});

it("arms recovery before external work and deduplicates a repeated alarm", async () => {
  const stub = env.EDITORIAL.getByName(crypto.randomUUID());
  await runInDurableObject(stub, async (_instance, state) => {
    const jobs = new PublicationJobs(state.storage);
    const now = Date.now();
    jobs.enqueue("first", now);
    let writes = 0;
    await publicationAlarm(
      state.storage,
      jobs,
      async (claim) => {
        expect(await state.storage.getAlarm()).toBe(claim.leaseUntil);
        // A duplicate delivery cannot obtain an active lease.
        await publicationAlarm(
          state.storage,
          jobs,
          async () => {
            writes++;
            return {};
          },
          () => now,
        );
        writes++;
        return { next: "commit", checkpoint: { baseHead: "a".repeat(40) } };
      },
      () => now,
    );
    expect(writes).toBe(1);
    expect(jobs.get("first")?.phase).toBe("commit");
    expect(await state.storage.getAlarm()).toBe(now + 1000);
    await state.storage.deleteAlarm();
  });
});

it("persists provider backoff through eviction instead of relying on browser polling", async () => {
  const stub = env.EDITORIAL.getByName(crypto.randomUUID());
  const now = Date.now();
  await runInDurableObject(stub, async (_instance, state) => {
    const jobs = new PublicationJobs(state.storage);
    jobs.enqueue("first", now);
    await publicationAlarm(
      state.storage,
      jobs,
      async () => {
        throw new GitHubFailure("rate_limited", 120_000);
      },
      () => now,
    );
    expect(await state.storage.getAlarm()).toBe(now + 120_000);
  });
  await evictDurableObject(stub);
  await runInDurableObject(stub, async (_instance, state) => {
    const jobs = new PublicationJobs(state.storage);
    let calls = 0;
    await publicationAlarm(
      state.storage,
      jobs,
      async () => {
        calls++;
        return {};
      },
      () => now + 1000,
    );
    expect(calls).toBe(0);
    expect(jobs.get("first")?.dueAt).toBe(now + 120_000);
    await state.storage.deleteAlarm();
  });
});

it("executes the actual alarm handler after eviction and stops unconfigured publishing", async () => {
  const stub = env.EDITORIAL.getByName(crypto.randomUUID());
  await runInDurableObject(stub, async (_instance, state) => {
    new PublicationJobs(state.storage).enqueue("first", Date.now());
    await state.storage.setAlarm(Date.now() + 60_000);
  });
  await evictDurableObject(stub);
  expect(await runDurableObjectAlarm(stub)).toBe(true);
  await runInDurableObject(stub, async (_instance, state) => {
    const jobs = new PublicationJobs(state.storage);
    expect(jobs.get("first")?.blocked).toBe("publisher_not_configured");
    expect(jobs.get("first")?.phase).toBe("validate");
  });
  // The pre-armed crash-recovery wake is harmless once blocked and does not loop.
  expect(await runDurableObjectAlarm(stub)).toBe(true);
  expect(await runDurableObjectAlarm(stub)).toBe(false);
});
