import { createHash } from "node:crypto";
import {
  inspectEditorialMediaAdmission,
  MAX_MEDIA_BYTES,
  MAX_MEDIA_PIXELS,
  MAX_MEDIA_DIMENSION,
} from "../../src/editorial/media-store";
import {
  mediaCropProvenance,
  planMediaCrop,
} from "../../src/editorial/media-processing-plan";
import { PngInspector } from "../../src/editorial/media-processing-stream";
import type {
  MediaCommitStorage,
  MediaCommitTransaction,
  PreparedMediaCrop,
} from "../../src/editorial/media-processing-store";

// Fixed real encoded 1x1 images. These fixtures qualify byte/transaction
// consistency, not Images, decoder validity or provider-generated provenance.
export const storeJpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3E//Z",
  "base64",
);
export const storePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);
export const storeWebp = Buffer.from(
  "UklGRhwAAABXRUJQVlA4TA8AAAAvAAAAAAcQ/Y/+ByKi/wEA",
  "base64",
);
export const storeAnimatedWebp = Buffer.from(
  "UklGRoQAAABXRUJQVlA4WAoAAAACAAAAAAAAAAAAQU5JTQYAAAAAAAAAAABBTk1GKAAAAAAAAAAAAAAAAAAAAGQAAAJWUDhMDwAAAC8AAAAABxD9j/4HIqL/AQBBTk1GKAAAAAAAAAAAAAAAAAAAAGQAAABWUDhMDwAAAC8AAAAABxDR//4HIqL/AQA=",
  "base64",
);
export const storeAlternatePng = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR4AQEFAPr/AP8AAP8FAAH/+lyI0QAAAABJRU5ErkJggg==",
    "base64",
  ),
);

export function jpegWithComments(count = 3) {
  const comment = new Uint8Array(60_004).fill(7);
  comment.set([0xff, 0xfe, 0xea, 0x62]);
  const result = new Uint8Array(storeJpeg.length + count * comment.length);
  result.set(storeJpeg.subarray(0, 2));
  for (let index = 0; index < count; index++)
    result.set(comment, 2 + index * comment.length);
  result.set(storeJpeg.subarray(2), 2 + count * comment.length);
  return result;
}
export function preparedCropFixture(
  original = new Uint8Array(storeJpeg),
  bytes = new Uint8Array(storePng),
): PreparedMediaCrop {
  const parent = inspectEditorialMediaAdmission(original),
    output = inspectEditorialMediaAdmission(bytes);
  if (!parent.ok || !output.ok || output.media.type !== "image/png")
    throw new Error("Invalid fixture admission");
  const plan = planMediaCrop(parent.dimensions, {
    ratio: 1,
    zoom: 1,
    x: 0,
    y: 0,
  });
  const inspector = new PngInspector({
    maxBytes: MAX_MEDIA_BYTES,
    maxPixels: MAX_MEDIA_PIXELS,
    maxDimension: MAX_MEDIA_DIMENSION,
    dimensions: plan.output,
    canonical8Bit: true,
  });
  inspector.feed(bytes);
  return {
    bytes,
    media: { ...output.media, type: "image/png" },
    provenance: mediaCropProvenance(parent.media, plan, output.media),
    decode: {
      evidence: "provider-transcode-completed",
      original: parent.media,
      encoded: parent.dimensions,
      display: parent.dimensions,
      discardedPng: inspector.finish(),
    },
  };
}
export const storeHash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

/** Test-only fault adapter. The supplied backend still owns the transaction;
 * no rollback is simulated here when this wraps real SQLite storage. */
export function faultAfterWrite(
  storage: MediaCommitStorage,
  failKey: string,
): MediaCommitStorage {
  return {
    transaction<T>(
      callback: (transaction: MediaCommitTransaction) => Promise<T>,
    ) {
      return storage.transaction((transaction) =>
        callback({
          get: transaction.get.bind(transaction),
          list: transaction.list.bind(transaction),
          async put(key, value) {
            await transaction.put(key, value);
            if (key === failKey) throw new Error("synthetic_write_failure");
          },
        }),
      );
    },
  };
}
