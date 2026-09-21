import { describe, it, expect, vi } from "vitest";
import { MAX_SOURCE_BYTES } from "@anipotts/content/editorial/source";
import { HomeAutosave, readSaveResponse } from "./home-autosave";
import type { Draft, SaveResult } from "../editorial/draft-store";
const draft = (source: string, revision: number): Draft => ({
  key: "home",
  source,
  revision,
  baseCommit: "a".repeat(40),
  baseFileHash: "b".repeat(40),
  updatedAt: 1,
  discardedAt: null,
});
describe("home autosave", () => {
  it("persists an unchanged initial preview once and keeps ambiguous retries identical", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("lost response"))
      .mockResolvedValueOnce({ ok: true, draft: draft("base", 1) });
    const editor = new HomeAutosave("base", 0, send, () => {});
    await editor.flush();
    expect(send).not.toHaveBeenCalled();
    await editor.ensureDraft();
    expect(editor.state.status).toBe("unsaved");
    expect(editor.state.saveFailed).toBe(true);
    await editor.ensureDraft();
    expect(editor.state.saveFailed).toBe(false);
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
    expect(editor.state).toMatchObject({
      source: "base",
      revision: 1,
      status: "saved",
    });
    await editor.ensureDraft();
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("does not bypass a conflict when preview requests an initial draft", async () => {
    const send = vi.fn().mockResolvedValue({
      ok: false,
      code: "revision_conflict",
      current: draft("another tab", 1),
      conflictId: "conflict",
    });
    const editor = new HomeAutosave("base", 0, send, () => {});
    await editor.ensureDraft();
    await editor.ensureDraft();
    expect(send).toHaveBeenCalledTimes(1);
    expect(editor.state.status).toBe("conflict");
  });
  it("retries an ambiguous response with the identical operation, then saves newer typing", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("lost response"))
      .mockResolvedValueOnce({ ok: true, draft: draft("one", 1) })
      .mockResolvedValueOnce({ ok: true, draft: draft("two", 2) });
    const editor = new HomeAutosave("base", 0, send, () => {});
    editor.edit("one");
    await editor.flush();
    expect(editor.state.status).toBe("unsaved");
    expect(editor.state.saveFailed).toBe(true);
    editor.edit("two");
    expect(editor.state.saveFailed).toBe(true);
    await editor.flush();
    expect(editor.state.saveFailed).toBe(false);
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
    expect(send.mock.calls[2][0]).toMatchObject({
      source: "two",
      expectedRevision: 1,
    });
    expect(editor.state).toMatchObject({
      source: "two",
      revision: 2,
      status: "saved",
    });
  });
  it("serializes concurrent flushes and preserves typing during a save", async () => {
    let finish!: (result: SaveResult) => void;
    const send = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<SaveResult>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce({ ok: true, draft: draft("two", 2) });
    const editor = new HomeAutosave("base", 0, send, () => {});
    editor.edit("one");
    const first = editor.flush();
    editor.edit("two");
    const second = editor.flush();
    expect(send).toHaveBeenCalledTimes(1);
    finish({ ok: true, draft: draft("one", 1) });
    await Promise.all([first, second]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(editor.state.source).toBe("two");
    expect(editor.state.status).toBe("saved");
  });
  it("stops on conflict until an explicit choice and uses the winning revision", async () => {
    const current = draft("other device", 3);
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        code: "revision_conflict",
        current,
        conflictId: "conflict",
      })
      .mockResolvedValueOnce({ ok: true, draft: draft("mine", 4) });
    const editor = new HomeAutosave("base", 0, send, () => {});
    editor.edit("mine");
    await editor.flush();
    await editor.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(editor.state.source).toBe("mine");
    editor.resolve(current, true);
    await editor.flush();
    expect(send.mock.calls[1][0]).toMatchObject({
      source: "mine",
      expectedRevision: 3,
    });
    expect(editor.state.status).toBe("saved");
  });
  it("preserves an unprovable old save until an explicit comparison choice", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        code: "save_reconciliation_required",
      })
      .mockResolvedValueOnce({ ok: true, draft: draft("newer typing", 4) });
    const editor = new HomeAutosave("base", 1, send, () => {});
    editor.edit("old pending source");
    await editor.flush();
    const pending = editor.recovery().pending;
    editor.edit("newer typing");
    await editor.flush();
    await editor.ensureDraft();
    expect(send).toHaveBeenCalledTimes(1);
    expect(editor.recovery()).toMatchObject({
      source: "newer typing",
      pending,
    });
    expect(editor.state.saveFailureCode).toBe("save_reconciliation_required");
    editor.resolve(draft("saved on another device", 3), true);
    await editor.flush();
    expect(send.mock.calls[1][0]).toMatchObject({
      source: "newer typing",
      expectedRevision: 3,
    });
    expect(send.mock.calls[1][0].requestId).not.toBe(pending?.requestId);
    expect(editor.state.saveFailureCode).toBeUndefined();
    expect(editor.state.status).toBe("saved");
  });
  it("can choose the compared saved version without sending another save", async () => {
    const send = vi
      .fn()
      .mockResolvedValue({ ok: false, code: "save_reconciliation_required" });
    const editor = new HomeAutosave("base", 1, send, () => {});
    editor.edit("mine");
    await editor.flush();
    editor.resolve(draft("saved version", 3), false);
    await editor.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(editor.recovery().pending).toBeNull();
    expect(editor.state).toMatchObject({
      source: "saved version",
      revision: 3,
      status: "saved",
    });
  });
});

describe("definitive save rejections", () => {
  it("stops resending a refused draft and saves the next different edit as a new operation", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, code: "invalid_draft_request" })
      .mockResolvedValueOnce({ ok: true, draft: draft("trimmed", 2) });
    const editor = new HomeAutosave("base", 1, send, () => {});
    editor.edit("refused");
    await editor.flush();
    expect(editor.state).toMatchObject({
      status: "unsaved",
      saveFailed: true,
      saveFailureCode: "invalid_draft_request",
    });
    await editor.flush();
    await editor.ensureDraft();
    expect(send).toHaveBeenCalledTimes(1);
    // The server stored nothing for the refused payload; recovery keeps the text.
    expect(editor.recovery()).toMatchObject({
      source: "refused",
      pending: null,
    });
    editor.edit("trimmed");
    await editor.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toMatchObject({
      source: "trimmed",
      expectedRevision: 1,
    });
    expect(send.mock.calls[1][0].requestId).not.toBe(
      send.mock.calls[0][0].requestId,
    );
    expect(editor.state.saveFailureCode).toBeUndefined();
    expect(editor.state.status).toBe("saved");
  });
  it("never sends a source over the save limit and resumes once it fits", async () => {
    const send = vi
      .fn()
      .mockImplementation(async ({ source, expectedRevision }) => ({
        ok: true,
        draft: draft(source, expectedRevision + 1),
      }));
    const editor = new HomeAutosave("base", 1, send, () => {});
    const oversized = "x".repeat(MAX_SOURCE_BYTES + 1);
    editor.edit(oversized);
    await editor.flush();
    await editor.flush();
    await editor.ensureDraft();
    expect(send).not.toHaveBeenCalled();
    expect(editor.state).toMatchObject({
      status: "unsaved",
      saveFailed: true,
      saveFailureCode: "source_too_large",
    });
    expect(editor.recovery().pending).toBeNull();
    editor.edit("x".repeat(MAX_SOURCE_BYTES));
    await editor.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(editor.state).toMatchObject({ status: "saved", revision: 2 });
    expect(editor.state.saveFailed).toBe(false);
  });
  it("clears a refusal when edits return to the acknowledged source", async () => {
    const send = vi.fn();
    const editor = new HomeAutosave("base", 1, send, () => {});
    editor.edit("x".repeat(MAX_SOURCE_BYTES + 1));
    await editor.flush();
    editor.edit("base");
    expect(editor.state).toMatchObject({ status: "saved", saveFailed: false });
    expect(editor.state.saveFailureCode).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
  it("settles a refusal that answers after edits returned to the saved source", async () => {
    let answer!: (result: SaveResult) => void;
    const send = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<SaveResult>((resolve) => {
            answer = resolve;
          }),
      )
      .mockResolvedValue({ ok: false, code: "invalid_draft_request" });
    const notify = vi.fn();
    const editor = new HomeAutosave("base", 1, send, notify);
    editor.edit("refused");
    const flushing = editor.flush();
    editor.edit("base");
    answer({ ok: false, code: "invalid_draft_request" });
    await flushing;
    // The editor holds the acknowledged source, so nothing is left unsaved.
    for (const state of [editor.state, notify.mock.lastCall![0]]) {
      expect(state).toMatchObject({
        source: "base",
        status: "saved",
        saveFailed: false,
      });
      expect(state.saveFailureCode).toBeUndefined();
    }
    await editor.flush();
    expect(send).toHaveBeenCalledTimes(1);
    // Typing the refused text again is a new attempt, never a silent stall.
    editor.edit("refused");
    await editor.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(editor.state).toMatchObject({
      status: "unsaved",
      saveFailed: true,
      saveFailureCode: "invalid_draft_request",
    });
  });
  it("holds a reused operation id for comparison instead of resending it", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, code: "idempotency_key_reused" })
      .mockResolvedValueOnce({ ok: true, draft: draft("newer typing", 4) });
    const editor = new HomeAutosave("base", 1, send, () => {});
    editor.edit("old pending source");
    await editor.flush();
    const pending = editor.recovery().pending;
    editor.edit("newer typing");
    await editor.flush();
    await editor.ensureDraft();
    expect(send).toHaveBeenCalledTimes(1);
    expect(editor.state.saveFailureCode).toBe("idempotency_key_reused");
    expect(editor.recovery()).toMatchObject({
      source: "newer typing",
      pending,
    });
    editor.resolve(draft("saved on another device", 3), true);
    await editor.flush();
    expect(send.mock.calls[1][0]).toMatchObject({
      source: "newer typing",
      expectedRevision: 3,
    });
    expect(send.mock.calls[1][0].requestId).not.toBe(pending?.requestId);
    expect(editor.state.status).toBe("saved");
  });
  it("keeps retrying a base race with the identical operation", async () => {
    // draft_base_changed writes no receipt, so the same request can still land.
    const send = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, code: "draft_base_changed" })
      .mockResolvedValueOnce({ ok: true, draft: draft("mine", 2) });
    const editor = new HomeAutosave("base", 1, send, () => {});
    editor.edit("mine");
    await editor.flush();
    expect(editor.state.saveFailureCode).toBe("draft_base_changed");
    await editor.flush();
    expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
    expect(editor.state).toMatchObject({ status: "saved", revision: 2 });
  });
});

describe("explicit resolution", () => {
  const unresolved = {
    save_reconciliation_required: {
      ok: false,
      code: "save_reconciliation_required",
    },
    revision_conflict: {
      ok: false,
      code: "revision_conflict",
      current: draft("theirs", 3),
      conflictId: "conflict",
    },
  } as const;
  describe.each(Object.keys(unresolved) as (keyof typeof unresolved)[])(
    "from %s",
    (start) => {
      it.each([true, false])(
        "immediately clears the failure and conflict when keepMine is %s",
        async (keepMine) => {
          const send = vi.fn().mockResolvedValue(unresolved[start]);
          const notify = vi.fn();
          const editor = new HomeAutosave("base", 1, send, notify);
          editor.edit("mine");
          await editor.flush();
          expect(editor.state.status).toBe(
            start === "revision_conflict" ? "conflict" : "unsaved",
          );
          editor.resolve(draft("theirs", 3), keepMine);
          for (const state of [editor.state, notify.mock.lastCall![0]]) {
            expect(state.saveFailed).toBeFalsy();
            expect(state.saveFailureCode).toBeUndefined();
            expect(state.conflict).toBeNull();
            expect(state.revision).toBe(3);
          }
          expect(send).toHaveBeenCalledTimes(1);
        },
      );
    },
  );
  it.each([
    ["save_reconciliation_required", { code: "save_reconciliation_required" }],
    [
      "revision_conflict",
      { code: "revision_conflict", current: null, conflictId: "conflict" },
    ],
  ])(
    "keeps edits as a new draft when %s finds no saved draft",
    async (_, failure) => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, ...failure })
        .mockImplementation(async ({ source, expectedRevision }) => ({
          ok: true,
          draft: draft(source, expectedRevision + 1),
        }));
      const editor = new HomeAutosave("base", 2, send, () => {});
      editor.edit("mine");
      await editor.flush();
      const first = send.mock.calls[0][0];
      const unresolvedState = editor.state;
      // There is no saved version to choose.
      editor.resolve(null, false);
      expect(editor.state).toBe(unresolvedState);
      editor.resolve(null, true);
      expect(editor.state).toMatchObject({
        source: "mine",
        revision: 0,
        status: "unsaved",
        conflict: null,
      });
      expect(editor.state.saveFailureCode).toBeUndefined();
      expect(editor.recovery().pending).toMatchObject({
        source: "mine",
        expectedRevision: 0,
      });
      await editor.flush();
      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1][0]).toMatchObject({
        source: "mine",
        expectedRevision: 0,
      });
      expect(send.mock.calls[1][0].requestId).not.toBe(first.requestId);
      expect(editor.state).toMatchObject({ status: "saved", revision: 1 });
    },
  );
});

describe("save responses", () => {
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status });
  it.each([
    "invalid_draft_request",
    "idempotency_key_reused",
    "draft_base_changed",
  ])("returns a %s refusal instead of throwing", async (code) => {
    await expect(
      readSaveResponse(reply(400, { ok: false, code, valid: true })),
    ).resolves.toEqual({ ok: false, code });
  });
  it("returns successful and conflicting saves unchanged", async () => {
    await expect(
      readSaveResponse(reply(200, { ok: true, draft: draft("one", 1) })),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      readSaveResponse(
        reply(409, { ok: false, code: "save_reconciliation_required" }),
      ),
    ).resolves.toMatchObject({ code: "save_reconciliation_required" });
  });
  it.each([
    [400, { error: "invalid_request" }],
    [400, { error: "invalid_revision" }],
    [400, { ok: false, code: "revision_conflict" }],
    [400, "not json"],
    [500, { ok: false, code: "invalid_draft_request" }],
    [503, { error: "unavailable" }],
  ])("keeps a %s %j response ambiguous", async (status, body) => {
    await expect(readSaveResponse(reply(status, body))).rejects.toThrow();
  });
});

describe("draft recovery", () => {
  it("replays an ambiguous operation after reload before saving newer edits", async () => {
    const firstSend = vi.fn().mockRejectedValue(new Error("offline"));
    const first = new HomeAutosave("base", 0, firstSend, () => {});
    first.edit("first");
    await first.flush();
    first.edit("newer");
    const recovery = first.recovery();
    const send = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, draft: draft("first", 1) })
      .mockResolvedValueOnce({ ok: true, draft: draft("newer", 2) });
    const reopened = new HomeAutosave("first", 1, send, () => {});
    reopened.recover(recovery);
    await reopened.flush();
    expect(send.mock.calls[0]).toEqual(firstSend.mock.calls[0]);
    expect(send.mock.calls[1][0]).toMatchObject({
      source: "newer",
      expectedRevision: 1,
    });
    expect(reopened.state).toMatchObject({
      source: "newer",
      revision: 2,
      status: "saved",
    });
  });
  it("retains the recovery revision so another tab cannot be silently overwritten", async () => {
    const first = new HomeAutosave("base", 1, vi.fn(), () => {});
    first.edit("mine");
    const send = vi.fn().mockResolvedValue({
      ok: false,
      code: "revision_conflict",
      current: draft("theirs", 2),
      conflictId: "conflict",
    });
    const reopened = new HomeAutosave("theirs", 2, send, () => {});
    reopened.recover(first.recovery());
    await reopened.flush();
    expect(send.mock.calls[0][0]).toMatchObject({
      source: "mine",
      expectedRevision: 1,
    });
    expect(reopened.state).toMatchObject({
      source: "mine",
      status: "conflict",
    });
  });
});

describe("explicit review checkpoint", () => {
  it("stores unchanged acknowledged text once while concurrent requests share the operation", async () => {
    let finish!: (result: SaveResult) => void;
    const send = vi.fn().mockImplementation(
      () =>
        new Promise<SaveResult>((resolve) => {
          finish = resolve;
        }),
    );
    const editor = new HomeAutosave("same text", 3, send, () => {});
    await editor.flush();
    expect(send).not.toHaveBeenCalled();
    const first = editor.checkpoint();
    const second = editor.checkpoint();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({
      source: "same text",
      expectedRevision: 3,
    });
    expect(editor.recovery().pending).toEqual(send.mock.calls[0][0]);
    finish({ ok: true, draft: draft("same text", 4) });
    await Promise.all([first, second]);
    expect(editor.state).toMatchObject({
      source: "same text",
      revision: 4,
      status: "saved",
    });
    await editor.flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("recovers an ambiguous unchanged checkpoint with the same identity after reload", async () => {
    const failedSend = vi.fn().mockRejectedValue(new Error("response lost"));
    const first = new HomeAutosave("same text", 3, failedSend, () => {});
    await first.checkpoint();
    const recovery = first.recovery();
    expect(recovery).toMatchObject({
      source: "same text",
      saved: "same text",
      revision: 3,
      pending: { expectedRevision: 3 },
    });
    const send = vi
      .fn()
      .mockResolvedValue({ ok: true, draft: draft("same text", 4) });
    const reopened = new HomeAutosave("same text", 4, send, () => {});
    reopened.recover(recovery);
    await reopened.checkpoint();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toEqual(failedSend.mock.calls[0]);
    expect(reopened.state).toMatchObject({ revision: 4, status: "saved" });
  });

  it("preserves edits made during the checkpoint and saves them normally afterward", async () => {
    let finish!: (result: SaveResult) => void;
    const send = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<SaveResult>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce({ ok: true, draft: draft("new typing", 5) });
    const editor = new HomeAutosave("same text", 3, send, () => {});
    const checkpoint = editor.checkpoint();
    editor.edit("new typing");
    finish({ ok: true, draft: draft("same text", 4) });
    await checkpoint;
    expect(send.mock.calls[1][0]).toMatchObject({
      source: "new typing",
      expectedRevision: 4,
    });
    expect(editor.state).toMatchObject({
      source: "new typing",
      revision: 5,
      status: "saved",
    });
  });

  it.each([
    {
      ok: false,
      code: "revision_conflict",
      current: draft("other tab", 4),
      conflictId: "held",
    },
    { ok: false, code: "save_reconciliation_required" },
    { ok: false, code: "idempotency_key_reused" },
    { ok: false, code: "invalid_draft_request" },
  ])(
    "preserves an unresolved $code instead of allocating a new operation",
    async (outcome) => {
      const send = vi.fn().mockResolvedValue(outcome);
      const editor = new HomeAutosave("saved", 3, send, () => {});
      editor.edit("mine");
      await editor.flush();
      const held = editor.recovery();
      const state = editor.state;
      await editor.checkpoint();
      expect(send).toHaveBeenCalledTimes(1);
      expect(editor.recovery()).toEqual(held);
      expect(editor.state).toEqual(state);
    },
  );

  it("flushes existing unsaved edits without making a redundant equal-text revision", async () => {
    const send = vi
      .fn()
      .mockResolvedValue({ ok: true, draft: draft("edited", 4) });
    const editor = new HomeAutosave("saved", 3, send, () => {});
    editor.edit("edited");
    await editor.checkpoint();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({
      source: "edited",
      expectedRevision: 3,
    });
    expect(editor.state.revision).toBe(4);
  });
});
