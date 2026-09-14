import { afterEach, expect, it, vi } from "vitest";
import { publicationReadiness } from "./publication-readiness";
function bindings(version = 0) {
  const first = vi.fn().mockResolvedValue({ version });
  const head = vi.fn().mockResolvedValue(null);
  return {
    CONTENT_DB: { prepare: vi.fn(() => ({ first })) },
    CONTENT_MEDIA: { head },
  };
}
afterEach(() => vi.useRealTimers());
it("requires both bindings even when the publication schema is available", async () => {
  expect(await publicationReadiness(undefined)).toEqual({
    content_runtime: 0,
    content_media: 0,
  });
  expect(
    await publicationReadiness({ CONTENT_DB: bindings().CONTENT_DB }),
  ).toEqual({ content_runtime: 0, content_media: 0 });
});
it("accepts an empty accessible bucket without writing an object", async () => {
  const env = bindings();
  expect(await publicationReadiness(env)).toEqual({
    content_runtime: 1,
    content_media: 1,
  });
  expect(env.CONTENT_MEDIA.head).toHaveBeenCalledExactlyOnceWith(
    "__readiness__/publication-media",
  );
});
it("holds readiness when the media provider rejects access", async () => {
  const env = bindings();
  env.CONTENT_MEDIA.head.mockRejectedValue(new Error("provider detail"));
  expect(await publicationReadiness(env)).toEqual({
    content_runtime: 0,
    content_media: 0,
  });
});
it("holds readiness for failed or invalid publication storage", async () => {
  expect((await publicationReadiness(bindings(-1))).content_runtime).toBe(0);
  const env = bindings();
  env.CONTENT_DB.prepare().first.mockRejectedValue(
    new Error("storage failure"),
  );
  expect((await publicationReadiness(env)).content_runtime).toBe(0);
});
it("bounds an unresponsive binding and clears the deadline", async () => {
  vi.useFakeTimers();
  const env = bindings();
  env.CONTENT_MEDIA.head.mockReturnValue(new Promise(() => {}));
  const result = publicationReadiness(env);
  await vi.advanceTimersByTimeAsync(3000);
  expect(await result).toEqual({ content_runtime: 0, content_media: 0 });
  expect(vi.getTimerCount()).toBe(0);
});
