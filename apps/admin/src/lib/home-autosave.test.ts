import { describe, it, expect, vi } from "vitest";
import { HomeAutosave } from "./home-autosave";
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
