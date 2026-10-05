import { describe, it, expect } from "vitest";
import { publicationSourceHash } from "@anipotts/content/editorial/publication-contract";
import {
  reconcilePublishedBaseline,
  verifiedPublication,
} from "./published-baseline";
import type { DirectPublicationStatus } from "./editorial-publication-status";

describe("verified public comparison", () => {
  it("rejects a different receipt, changed bytes and incomplete verification", async () => {
    const source = "immutable published source";
    const job = {
      phase: "live",
      publicationId: "receipt",
      verifiedAt: 1,
      blocked: null,
      superseded: false,
      sourceSha256: await publicationSourceHash(source),
    } as DirectPublicationStatus;
    const base = {
      source,
      publicationId: "receipt",
      baseCommit: "",
      baseFileHash: null,
    };
    expect(await reconcilePublishedBaseline(job, base)).toBe(base);
    await expect(
      reconcilePublishedBaseline(job, { ...base, publicationId: "other" }),
    ).rejects.toThrow();
    await expect(
      reconcilePublishedBaseline(job, { ...base, source: "newer publication" }),
    ).rejects.toThrow();
    for (const change of [
      { verifiedAt: null },
      { superseded: true },
      { blocked: "paused" },
      { phase: "verify" as const },
    ]) {
      const unconfirmed = { ...job, ...change };
      expect(verifiedPublication(unconfirmed)).toBe(false);
      await expect(
        reconcilePublishedBaseline(unconfirmed, base),
      ).rejects.toThrow();
    }
  });
});
