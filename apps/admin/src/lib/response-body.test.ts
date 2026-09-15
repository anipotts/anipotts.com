import { describe, expect, it, vi } from "vitest";
import { discardBody } from "./response-body";

describe("discardBody", () => {
  it("cancels an unread body and swallows a cancel failure", async () => {
    const cancel = vi.fn(async () => {
      throw new Error("already closed");
    });
    const response = new Response("unavailable", { status: 503 });
    Object.defineProperty(response, "body", { value: { cancel } });
    expect(() => discardBody(response)).not.toThrow();
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("leaves a body that was already read alone", async () => {
    const response = new Response("{}", { status: 500 });
    await response.text();
    expect(() => discardBody(response)).not.toThrow();
  });
});
