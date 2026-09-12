import { describe, expect, it } from "vitest";
import { decodeLifeResponse, LIFE_RESPONSE_BYTE_LIMIT } from "./life-response";

const signal = () => new AbortController().signal;
const json = (body: BodyInit, headers: HeadersInit = {}) =>
  new Response(body, {
    headers: { "content-type": "application/json", ...headers },
  });

describe("bounded Life response decoding", () => {
  it("preserves UTF-8 split across network chunks", async () => {
    const encoded = new TextEncoder().encode('{"body":"😀"}');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of encoded) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    });
    await expect(decodeLifeResponse(json(stream), signal())).resolves.toEqual({
      body: "😀",
    });
  });

  it("rejects a lying content length and cancels the oversized stream", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(LIFE_RESPONSE_BYTE_LIMIT + 1));
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(
      decodeLifeResponse(json(stream, { "content-length": "1" }), signal()),
    ).rejects.toThrow("Unsupported Life response");
    expect(cancelled).toBe(true);
  });

  it("accepts the exact byte boundary", async () => {
    const body = '"' + "a".repeat(LIFE_RESPONSE_BYTE_LIMIT - 2) + '"';
    await expect(
      decodeLifeResponse(json(body), signal()),
    ).resolves.toHaveLength(LIFE_RESPONSE_BYTE_LIMIT - 2);
  });

  it("cancels a stalled read on abort", async () => {
    let cancelled = false;
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const pending = decodeLifeResponse(json(stream), controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow("Unsupported Life response");
    expect(cancelled).toBe(true);
  });

  it("sanitizes malformed JSON and invalid UTF-8 failures", async () => {
    for (const body of ["private malformed source", new Uint8Array([0xff])]) {
      await expect(decodeLifeResponse(json(body), signal())).rejects.toThrow(
        /^Unsupported Life response$/,
      );
    }
  });

  it("rejects failed, non-JSON and excessive declared responses", async () => {
    for (const response of [
      new Response("private error", { status: 403 }),
      new Response("<html>login</html>"),
      json("{}", { "content-length": String(LIFE_RESPONSE_BYTE_LIMIT + 1) }),
    ]) {
      await expect(decodeLifeResponse(response, signal())).rejects.toThrow(
        /^Unsupported Life response$/,
      );
    }
  });
});
