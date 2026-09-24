// Where a committed admin screenshot's data came from, stamped into the PNG.
//
// The round-2 shot script (scripts/admin/round2-screenshots.mjs) writes one
// tEXt chunk, keyword "admin-fixture", naming the page's data origin. It
// shoots only `?fixture=synthetic` pages and refuses a page that carries
// the Replay mark, so every committed shot says "synthetic". The fixture
// boundary check (scripts/ci/admin-fixture-boundary.test.mjs) refuses a
// committed screenshot that says anything else, or says nothing: a replay
// of System's live payloads never lands in the repository as a picture.
import { crc32 } from "node:zlib";

export const ORIGIN_KEYWORD = "admin-fixture";
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunks(png) {
  if (!Buffer.isBuffer(png) || !png.subarray(0, 8).equals(SIGNATURE))
    throw new Error("not a PNG");
  const found = [];
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("latin1", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > png.length) throw new Error("truncated PNG");
    found.push({
      type,
      offset,
      end,
      data: png.subarray(offset + 8, offset + 8 + length),
    });
    offset = end;
    if (type === "IEND") break;
  }
  return found;
}

/** The stamped origin ("synthetic"), or null when the PNG carries none. */
export function readOrigin(png) {
  for (const chunk of chunks(png)) {
    if (chunk.type !== "tEXt") continue;
    const split = chunk.data.indexOf(0);
    if (split < 0) continue;
    if (chunk.data.toString("latin1", 0, split) === ORIGIN_KEYWORD)
      return chunk.data.toString("latin1", split + 1);
  }
  return null;
}

/** The PNG with its origin stamped right after IHDR, replacing any stamp. */
export function withOrigin(png, origin) {
  if (!/^[a-z]+$/.test(origin)) throw new Error("origin must be a word");
  const all = chunks(png);
  const ihdr = all[0];
  if (!ihdr || ihdr.type !== "IHDR") throw new Error("PNG without IHDR");
  const kept = all.filter(
    (chunk) =>
      !(
        chunk.type === "tEXt" &&
        chunk.data.toString("latin1", 0, chunk.data.indexOf(0)) ===
          ORIGIN_KEYWORD
      ),
  );
  const data = Buffer.from(`${ORIGIN_KEYWORD}\0${origin}`, "latin1");
  const type = Buffer.from("tEXt", "latin1");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])) >>> 0);
  const stamp = Buffer.concat([length, type, data, crc]);
  return Buffer.concat([
    png.subarray(0, ihdr.end),
    stamp,
    ...kept.slice(1).map((chunk) => png.subarray(chunk.offset, chunk.end)),
  ]);
}
