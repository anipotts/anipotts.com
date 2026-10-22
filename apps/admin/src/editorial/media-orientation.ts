import { MediaProcessingError } from "./media-processing-stream";
import {
  validDimensions,
  type DisplayDimensions,
} from "./media-processing-plan";

type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type Rectangle = { x: number; y: number; width: number; height: number };
const unsupported = (): never => {
  throw new MediaProcessingError("unsupported_image");
};
const text = (bytes: Uint8Array, start: number, size: number) =>
  String.fromCharCode(...bytes.subarray(start, start + size));

// CIPA Exif's IFD0 Orientation tag (0x0112, SHORT, count 1). Follow no linked
// directories, thumbnails or arbitrary metadata offsets beyond this payload.
// https://cipa.jp/std/documents/e/DC-X010-2017.pdf
function tiffOrientation(bytes: Uint8Array): Orientation {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const order = text(bytes, 0, 2);
  if (order !== "II" && order !== "MM") return unsupported();
  const little = order === "II";
  const u16 = (at: number) => {
    if (at < 0 || at + 2 > bytes.length) return unsupported();
    return view.getUint16(at, little);
  };
  const u32 = (at: number) => {
    if (at < 0 || at + 4 > bytes.length) return unsupported();
    return view.getUint32(at, little);
  };
  if (u16(2) !== 42) return unsupported();
  const ifd = u32(4);
  if (ifd < 8) return unsupported();
  const count = u16(ifd);
  if (ifd + 2 + count * 12 + 4 > bytes.length) return unsupported();
  let orientation: Orientation = 1;
  let found = false;
  for (let index = 0; index < count; index++) {
    const entry = ifd + 2 + index * 12;
    if (u16(entry) !== 0x0112) continue;
    const value = u16(entry + 8);
    if (
      found ||
      u16(entry + 2) !== 3 ||
      u32(entry + 4) !== 1 ||
      value < 1 ||
      value > 8
    )
      return unsupported();
    found = true;
    orientation = value as Orientation;
  }
  return orientation;
}

/** Read only the original's bounded orientation metadata. Ambiguous/malformed
 * EXIF fails closed; absence means orientation 1. This is not a pixel decoder. */
export function mediaExifOrientation(
  bytes: Uint8Array,
  type: string,
): Orientation {
  let result: Orientation = 1;
  let found = false;
  const exif = (payload: Uint8Array) => {
    if (found) return unsupported();
    found = true;
    const tiff =
      text(payload, 0, 6) === "Exif\0\0" ? payload.subarray(6) : payload;
    result = tiffOrientation(tiff);
  };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === "image/jpeg") {
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 0xff) return unsupported();
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === undefined) return unsupported();
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (offset + 2 > bytes.length) return unsupported();
      const size = view.getUint16(offset);
      if (size < 2 || offset + size > bytes.length) return unsupported();
      if (marker === 0xe1 && text(bytes, offset + 2, 6) === "Exif\0\0")
        exif(bytes.subarray(offset + 2, offset + size));
      offset += size;
    }
  } else if (type === "image/png" || type === "image/webp") {
    const png = type === "image/png";
    let offset = png ? 8 : 12;
    while (offset + (png ? 12 : 8) <= bytes.length) {
      const size = view.getUint32(offset + (png ? 0 : 4), !png);
      const kind = text(bytes, offset + (png ? 4 : 0), 4);
      const start = offset + 8;
      const end = start + size;
      const next = end + (png ? 4 : size & 1);
      if (next > bytes.length) return unsupported();
      if (kind === (png ? "eXIf" : "EXIF")) exif(bytes.subarray(start, end));
      offset = next;
    }
  } else return unsupported();
  return result;
}

/** Cloudflare trims before rotation; inverse-map pixel-edge coordinates from
 * the EXIF-oriented display into the original encoded axes, including mirrors.
 * https://developers.cloudflare.com/images/optimization/features/#trim */
export function encodedCropRectangle(
  encoded: DisplayDimensions,
  display: DisplayDimensions,
  rectangle: Rectangle,
  orientation: Orientation,
): Rectangle {
  const swapped = orientation >= 5;
  if (
    !validDimensions(encoded) ||
    !validDimensions(display) ||
    display.width !== (swapped ? encoded.height : encoded.width) ||
    display.height !== (swapped ? encoded.width : encoded.height) ||
    !Object.values(rectangle).every(Number.isSafeInteger) ||
    rectangle.x < 0 ||
    rectangle.y < 0 ||
    rectangle.width < 1 ||
    rectangle.height < 1 ||
    rectangle.x + rectangle.width > display.width ||
    rectangle.y + rectangle.height > display.height
  )
    throw new MediaProcessingError("output_geometry");
  const { x, y, width, height } = rectangle;
  switch (orientation) {
    case 1:
      return { x, y, width, height };
    case 2:
      return { x: encoded.width - x - width, y, width, height };
    case 3:
      return {
        x: encoded.width - x - width,
        y: encoded.height - y - height,
        width,
        height,
      };
    case 4:
      return { x, y: encoded.height - y - height, width, height };
    case 5:
      return { x: y, y: x, width: height, height: width };
    case 6:
      return {
        x: y,
        y: encoded.height - x - width,
        width: height,
        height: width,
      };
    case 7:
      return {
        x: encoded.width - y - height,
        y: encoded.height - x - width,
        width: height,
        height: width,
      };
    case 8:
      return {
        x: encoded.width - y - height,
        y: x,
        width: height,
        height: width,
      };
  }
}
