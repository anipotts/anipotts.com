/// <reference types="@cloudflare/vitest-plugin/types" />
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { MAX_MEDIA_BYTES } from "../../src/editorial/media-store";
import { editorialMediaApi } from "../../src/lib/editorial-media-api";

describe("private editorial media storage", () => {
  it("requires CSRF for uploads and serves immutable bytes with private response headers", async () => {
    const storage = env.EDITORIAL.getByName(crypto.randomUUID());
    const csrf = "c".repeat(64);
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvM8AAAAASUVORK5CYII=",
      "base64",
    );
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
    const bytes = new Uint8Array(150_000).fill(7);
    bytes.set([0xff, 0xd8, 0xff]);
    bytes.set([0xff, 0xd9], bytes.length - 2);
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
});
