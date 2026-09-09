/// <reference types="@cloudflare/vitest-plugin/types" />
import { env } from "cloudflare:workers";
import { runInDurableObject, evictDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import { PublicationJobs } from "../../src/editorial/publication-jobs";

it("resumes the same blocked checkpoint once, including after eviction", async () => {
  const stub = env.EDITORIAL.getByName(crypto.randomUUID());
  const blocked = await runInDurableObject(stub, (_instance, state) => {
    const jobs = new PublicationJobs(state.storage);
    jobs.enqueue("first", 1000);
    jobs.enqueue("second", 1000);
    const claim = jobs.claim(1000)!;
    jobs.settle(
      claim,
      {
        next: "commit",
        checkpoint: { baseHead: "a".repeat(40) },
        blocked: "publication_hold",
      },
      1001,
    );
    return jobs.get("first")!;
  });
  await evictDurableObject(stub);
  await runInDurableObject(stub, (_instance, state) => {
    const jobs = new PublicationJobs(state.storage);
    expect(jobs.retry("missing", blocked.version, 2000)).toBe(false);
    expect(jobs.retry("first", blocked.version - 1, 2000)).toBe(false);
    expect(jobs.get("first")).toEqual(blocked);
    expect(jobs.retry("first", blocked.version, 2000)).toBe(true);
    expect(jobs.retry("first", blocked.version, 2000)).toBe(false);
    expect(jobs.get("first")).toEqual({
      ...blocked,
      blocked: null,
      dueAt: 2000,
      version: blocked.version + 1,
    });
    const resumed = jobs.claim(2000)!;
    expect(resumed.id).toBe("first");
    expect(resumed.phase).toBe("commit");
    expect(resumed.checkpoint).toEqual(blocked.checkpoint);
    expect(resumed.attempts).toBe(blocked.attempts + 1);
    expect(jobs.retry("first", resumed.version, 2001)).toBe(false);
  });
});

it("reclaims an expired lease after eviction and rejects the stale worker result", async () => {
  const stub = env.EDITORIAL.getByName(crypto.randomUUID());
  const first = await runInDurableObject(stub, (_instance, state) => {
    const jobs = new PublicationJobs(state.storage);
    jobs.enqueue("first", 1000);
    jobs.enqueue("second", 1000);
    const claim = jobs.claim(1000);
    expect(jobs.claim(1001)).toBeNull();
    return claim!;
  });
  await evictDurableObject(stub);
  await runInDurableObject(stub, (_instance, state) => {
    const jobs = new PublicationJobs(state.storage);
    const renewed = jobs.claim(62000)!;
    expect(renewed.id).toBe("first");
    expect(renewed.lease).not.toBe(first.lease);
    expect(jobs.settle(first, { next: "commit" }, 62000)).toBe(false);
    expect(
      jobs.settle(
        renewed,
        { next: "commit", checkpoint: { baseHead: "a".repeat(40) } },
        62000,
      ),
    ).toBe(true);
    expect(jobs.get("first")?.phase).toBe("commit");
    expect(jobs.claim(62000)?.id).toBe("first");
  });
});

it("persists backoff, blocks later publications, and prevents skipped verification", async () => {
  const stub = env.EDITORIAL.getByName(crypto.randomUUID());
  await runInDurableObject(stub, (_instance, state) => {
    const jobs = new PublicationJobs(state.storage);
    jobs.enqueue("first", 1000);
    jobs.enqueue("second", 1000);
    const claim = jobs.claim(1000)!;
    expect(() => jobs.settle(claim, { next: "live" }, 1001)).toThrow(
      "invalid_publication_transition",
    );
    expect(jobs.settle(claim, { retryAt: 10000 }, 1001)).toBe(true);
    expect(jobs.claim(9999)).toBeNull();
    const retry = jobs.claim(10000)!;
    expect(retry.attempts).toBe(2);
    expect(jobs.settle(retry, { blocked: "permission_required" }, 10001)).toBe(
      true,
    );
    expect(jobs.claim(100000)).toBeNull();
    expect(jobs.enqueue("first", 100000).blocked).toBe("permission_required");
  });
});

it("serializes cancellation and keeps merged work on the verification path", async () => {
  const stub = env.EDITORIAL.getByName(crypto.randomUUID());
  await runInDurableObject(stub, (_instance, state) => {
    const jobs = new PublicationJobs(state.storage);
    jobs.enqueue("first", 1000);
    jobs.enqueue("second", 1000);
    let claim = jobs.claim(1000)!;
    expect(jobs.requestCancel("first", claim.version, 1001)).toBe(false);
    expect(() => jobs.settle(claim, { next: "cancelled" }, 1001)).toThrow(
      "invalid_publication_transition",
    );
    jobs.settle(claim, { blocked: "invalid_content" }, 1001);
    expect(jobs.requestCancel("first", 0, 1002)).toBe(false);
    expect(jobs.requestCancel("first", jobs.get("first")!.version, 1002)).toBe(
      true,
    );
    claim = jobs.claim(1002)!;
    expect(claim.id).toBe("first");
    jobs.settle(claim, { next: "cancelled" }, 1003);
    expect(jobs.retry("first", jobs.get("first")!.version, 1004)).toBe(false);
    claim = jobs.claim(1004)!;
    expect(claim.id).toBe("second");
    jobs.settle(claim, { blocked: "publication_hold" }, 1005);
    jobs.requestCancel("second", jobs.get("second")!.version, 1006);
    claim = jobs.claim(1006)!;
    expect(() => jobs.settle(claim, { next: "deploy" }, 1007)).toThrow(
      "invalid_publication_transition",
    );
    jobs.settle(
      claim,
      { next: "deploy", checkpoint: { mergeCommit: "a".repeat(40) } },
      1007,
    );
    expect(
      jobs.requestCancel("second", jobs.get("second")!.version, 1008),
    ).toBe(false);
    expect(jobs.claim(1008)?.phase).toBe("deploy");
  });
});
