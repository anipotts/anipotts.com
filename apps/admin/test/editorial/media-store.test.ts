/// <reference types="@cloudflare/vitest-plugin/types" />
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  MAX_MEDIA_BYTES,
  MAX_MEDIA_DIMENSION,
  MAX_MEDIA_PIXELS,
} from "../../src/editorial/media-store";
import { editorialMediaApi } from "../../src/lib/editorial-media-api";

// Synthetic 1x1 RGB images encoded by Pillow. These fixtures are real encoded
// images; container admission does not establish a server-side pixel decode.
const jpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3E//Z",
  "base64",
);
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);
const webp = Buffer.from(
  "UklGRhwAAABXRUJQVlA4TA8AAAAvAAAAAAcQ/Y/+ByKi/wEA",
  "base64",
);
const lossyWebp = Buffer.from(
  "UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=",
  "base64",
);
const animatedWebp = Buffer.from(
  "UklGRoQAAABXRUJQVlA4WAoAAAACAAAAAAAAAAAAQU5JTQYAAAAAAAAAAABBTk1GKAAAAAAAAAAAAAAAAAAAAGQAAAJWUDhMDwAAAC8AAAAABxD9j/4HIqL/AQBBTk1GKAAAAAAAAAAAAAAAAAAAAGQAAABWUDhMDwAAAC8AAAAABxDR//4HIqL/AQA=",
  "base64",
);

function declaredSize(
  kind: "jpeg" | "png" | "webp",
  width: number,
  height: number,
) {
  const bytes = Buffer.from({ jpeg, png, webp }[kind]);
  if (kind === "png") {
    bytes.writeUInt32BE(width, 16);
    bytes.writeUInt32BE(height, 20);
  } else if (kind === "jpeg") {
    const frame = bytes.findIndex(
      (byte, index) => byte === 0xff && bytes[index + 1] === 0xc0,
    );
    bytes.writeUInt16BE(height, frame + 5);
    bytes.writeUInt16BE(width, frame + 7);
  } else {
    bytes.writeUInt32LE(((width - 1) | ((height - 1) << 14)) >>> 0, 21);
  }
  return bytes;
}

describe("private editorial media storage", () => {
  it("requires CSRF for uploads and serves immutable bytes with private response headers", async () => {
    const storage = env.EDITORIAL.getByName(crypto.randomUUID());
    const csrf = "c".repeat(64);
    const bytes = png;
    const headers = {
      Origin: "https://admin.anipotts.com",
      "Content-Type": "application/json",
      Cookie: `__Host-editorial-csrf=${csrf}`,
      "X-Editorial-CSRF": csrf,
    };
    const upload = (extra = {}) =>
      new Request("https://admin.anipotts.com/api/editorial/media", {
        method: "POST",
        headers: { ...headers, ...extra },
        body: JSON.stringify({ base64: bytes.toString("base64") }),
      });
    expect(
      (
        await editorialMediaApi(
          upload({ Origin: "https://other.example" }),
          storage,
        )
      ).status,
    ).toBe(403);
    const saved = await editorialMediaApi(upload(), storage);
    expect(saved.status).toBe(201);
    const { media } = (await saved.json()) as { media: { id: string } };
    const image = await editorialMediaApi(
      new Request(
        `https://admin.anipotts.com/api/editorial/media?id=${media.id}`,
      ),
      storage,
    );
    expect(image.headers.get("Cache-Control")).toBe("private, no-store");
    expect(image.headers.get("Content-Type")).toBe("image/png");
    expect(image.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(Buffer.from(await image.arrayBuffer())).toEqual(bytes);
  });
  it("retains original bytes across chunks and retries without changing the identity", async () => {
    const storage = env.EDITORIAL.getByName(crypto.randomUUID());
    // Legal JPEG comment segments exercise storage chunking without using a
    // signature-only filler payload that cannot be rendered as an image.
    const comment = Buffer.alloc(60_004, 7);
    comment.set([0xff, 0xfe, 0xea, 0x62]);
    const bytes = new Uint8Array(
      Buffer.concat([
        jpeg.subarray(0, 2),
        comment,
        comment,
        comment,
        jpeg.subarray(2),
      ]),
    );
    const saved = await storage.saveMedia(bytes);
    expect(saved).toMatchObject({
      ok: true,
      media: { type: "image/jpeg", size: bytes.length },
    });
    if (!saved.ok) throw new Error("Expected successful save");
    expect(await storage.saveMedia(bytes)).toEqual(saved);
    const restored = await storage.readMedia(saved.media.id);
    expect(restored?.bytes).toEqual(bytes);
    expect(await storage.readMedia("../../private")).toBeNull();
    expect(await storage.readMedia(`${"0".repeat(64)}.jpg`)).toBeNull();
    expect(
      await env.EDITORIAL.getByName(crypto.randomUUID()).readMedia(
        saved.media.id,
      ),
    ).toBeNull();
  });
  it("rejects active document formats and oversized uploads", async () => {
    const storage = env.EDITORIAL.getByName(crypto.randomUUID());
    expect(
      await storage.saveMedia(
        new TextEncoder().encode('<svg onload="alert(1)"></svg>'),
      ),
    ).toEqual({ ok: false, error: "unsupported_image" });
    expect(
      await storage.saveMedia(new Uint8Array(MAX_MEDIA_BYTES + 1)),
    ).toEqual({ ok: false, error: "image_too_large" });
  });
  it.each([
    ["image/jpeg", jpeg],
    ["image/png", png],
    ["image/webp", webp],
    ["image/webp", lossyWebp],
    ["image/webp", animatedWebp],
  ])(
    "stores a complete synthetic %s image with exact original bytes",
    async (type, bytes) => {
      const storage = env.EDITORIAL.getByName(crypto.randomUUID());
      const saved = await storage.saveMedia(new Uint8Array(bytes));
      expect(saved).toMatchObject({
        ok: true,
        media: { type, size: bytes.length },
      });
      if (!saved.ok) throw new Error("fixture");
      expect((await storage.readMedia(saved.media.id))?.bytes).toEqual(
        new Uint8Array(bytes),
      );
    },
  );
  it.each(["jpeg", "png", "webp"] as const)(
    "bounds declared %s pixels before any storage write",
    async (kind) => {
      const storage = env.EDITORIAL.getByName(crypto.randomUUID());
      const pixels = declaredSize(kind, 8192, 4096);
      expect(8192 * 4096).toBeGreaterThan(MAX_MEDIA_PIXELS);
      expect(await storage.saveMedia(pixels)).toEqual({
        ok: false,
        error: "image_too_large",
      });
      const id = `${await crypto.subtle.digest("SHA-256", pixels).then((hash) => Buffer.from(hash).toString("hex"))}.${kind === "jpeg" ? "jpg" : kind}`;
      expect(await storage.readMedia(id)).toBeNull();
    },
  );
  it.each(["jpeg", "png"] as const)(
    "rejects zero and excessive %s dimensions",
    async (kind) => {
      const storage = env.EDITORIAL.getByName(crypto.randomUUID());
      expect(await storage.saveMedia(declaredSize(kind, 0, 1))).toEqual({
        ok: false,
        error: "unsupported_image",
      });
      expect(
        await storage.saveMedia(declaredSize(kind, MAX_MEDIA_DIMENSION + 1, 1)),
      ).toEqual({ ok: false, error: "image_too_large" });
    },
  );
  it("rejects signatures, truncated containers, inconsistent RIFF sizes and missing scans", async () => {
    const storage = env.EDITORIAL.getByName(crypto.randomUUID());
    const filler = new Uint8Array(150_000).fill(7);
    filler.set([0xff, 0xd8, 0xff]);
    filler.set([0xff, 0xd9], filler.length - 2);
    const wrongRiff = Buffer.from(webp);
    wrongRiff.writeUInt32LE(webp.length, 4);
    const scan = jpeg.findIndex(
      (byte, index) => byte === 0xff && jpeg[index + 1] === 0xda,
    );
    const missingScan = Buffer.concat([
      jpeg.subarray(0, scan),
      Buffer.from([0xff, 0xd9]),
    ]);
    for (const bytes of [
      filler,
      png.subarray(0, 12),
      png.subarray(0, -1),
      webp.subarray(0, 12),
      webp.subarray(0, -1),
      jpeg.subarray(0, -1),
      wrongRiff,
      missingScan,
    ])
      expect(await storage.saveMedia(new Uint8Array(bytes))).toEqual({
        ok: false,
        error: "unsupported_image",
      });
  });
  it("bounds actual animation frame headers within the declared WebP canvas", async () => {
    const storage = env.EDITORIAL.getByName(crypto.randomUUID());
    const mismatched = Buffer.from(animatedWebp);
    const frame = mismatched.indexOf("VP8L");
    mismatched.writeUInt32LE(8191 | (4095 << 14), frame + 9);
    const truncatedFrame = Buffer.from(animatedWebp);
    truncatedFrame.writeUInt32LE(1000, frame + 4);
    for (const bytes of [mismatched, truncatedFrame])
      expect(await storage.saveMedia(bytes)).toEqual({
        ok: false,
        error: "unsupported_image",
      });
  });
});
