import { createHash, createPublicKey, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const manifestPath = "content/publication.json";
const sha = /^[a-f0-9]{40}$/;
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const allowedPath =
  /^content\/public\/(?:pages\/(?:home|work|writing|systems|newsletter)|(?:projects|writing)\/[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const imagePath =
  /^apps\/www\/public\/images\/editorial\/([a-f0-9]{64})\.(?:jpg|png|webp)$/;
const reject = () => {
  throw new Error("invalid_editorial_publication");
};

/** The key comes from protected base, never the publication branch. No draft
 * source or key material is included in errors. Only content bytes are allowed. */
export function verifyPublication({
  envelope,
  publicKey,
  branch,
  baseHead,
  files,
}) {
  if (typeof envelope !== "string" || envelope.length > 32_768) reject();
  let document;
  try {
    document = JSON.parse(envelope);
  } catch {
    reject();
  }
  if (
    !document ||
    typeof document !== "object" ||
    Object.keys(document).length !== 3
  )
    reject();
  const parts = [document.protected, document.payload, document.signature];
  if (
    parts.length !== 3 ||
    parts.some(
      (part) => typeof part !== "string" || !/^[A-Za-z0-9_-]+$/.test(part),
    )
  )
    reject();
  let header, payload, key;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    key = createPublicKey(publicKey);
  } catch {
    reject();
  }
  if (
    header?.alg !== "RS256" ||
    header?.typ !== "editorial-publication" ||
    Object.keys(header).length !== 2 ||
    key.asymmetricKeyType !== "rsa"
  )
    reject();
  if (
    !verify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      key,
      Buffer.from(parts[2], "base64url"),
    )
  )
    reject();
  if (
    payload?.version !== 1 ||
    payload.repository !== "anipotts/anipotts.com" ||
    !uuid.test(payload.operationId) ||
    branch !== `codex/editorial-${payload.operationId}` ||
    !Number.isSafeInteger(payload.revision) ||
    payload.revision < 1 ||
    !sha.test(payload.baseHead) ||
    payload.baseHead !== baseHead ||
    !Array.isArray(payload.files) ||
    payload.files.length < 1 ||
    payload.files.length > 11 ||
    !Array.isArray(files) ||
    files.length !== payload.files.length
  )
    reject();
  if (
    new Set(payload.files.map((file) => file?.path)).size !==
      payload.files.length ||
    payload.files.filter((file) => allowedPath.test(file?.path)).length !== 1
  )
    reject();
  let mediaBytes = 0;
  for (const expected of payload.files) {
    const actual = files.find((file) => file.path === expected?.path);
    const image = imagePath.exec(expected?.path);
    if (
      !expected ||
      (!allowedPath.test(expected.path) && !image) ||
      !/^[a-f0-9]{64}$/.test(expected.sha256) ||
      !actual ||
      actual.mode !== "100644" ||
      actual.type !== "blob" ||
      !Buffer.isBuffer(actual.bytes) ||
      actual.bytes.length > (image ? 10 * 1024 * 1024 : 512 * 1024) ||
      createHash("sha256").update(actual.bytes).digest("hex") !==
        expected.sha256
    )
      reject();
    if (image) {
      mediaBytes += actual.bytes.length;
      if (image[1] !== expected.sha256 || mediaBytes > 10 * 1024 * 1024)
        reject();
    }
  }
  const content = files.find((file) => allowedPath.test(file.path));
  const references = [
    ...new Set(
      Array.from(
        content.bytes
          .toString("utf8")
          .matchAll(/\/images\/editorial\/([a-f0-9]{64}\.(?:jpg|png|webp))/g),
        (match) => `apps/www/public/images/editorial/${match[1]}`,
      ),
    ),
  ].sort();
  const images = files
    .filter((file) => imagePath.test(file.path))
    .map((file) => file.path)
    .sort();
  if (JSON.stringify(references) !== JSON.stringify(images)) reject();
  return {
    operationId: payload.operationId,
    revision: payload.revision,
    files: files.length,
  };
}

function git(...args) {
  return execFileSync("git", args, {
    maxBuffer: 12 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
export function verifyCheckout({ base, head, branch }) {
  if (!sha.test(base) || !sha.test(head)) reject();
  // A single content commit based on the inspected protected head. Newer base
  // changes require a fresh conflict check and signed publication commit.
  const parents = git("show", "-s", "--format=%P", head).toString().trim();
  if (parents !== base) reject();
  const changed = git("diff", "--name-only", "--no-renames", "-z", base, head)
    .toString()
    .split("\0")
    .filter(Boolean);
  if (
    changed.length < 2 ||
    changed.length > 12 ||
    !changed.includes(manifestPath)
  )
    reject();
  const envelope = git("show", `${head}:${manifestPath}`).toString();
  let declarations;
  try {
    if (envelope.length > 32_768) reject();
    declarations = JSON.parse(
      Buffer.from(JSON.parse(envelope).payload, "base64url").toString("utf8"),
    ).files;
  } catch {
    reject();
  }
  if (
    !Array.isArray(declarations) ||
    declarations.length < 1 ||
    declarations.length > 11
  )
    reject();
  const paths = declarations.map((file) => file?.path);
  if (
    paths.some(
      (path) =>
        typeof path !== "string" ||
        (!allowedPath.test(path) && !imagePath.test(path)),
    ) ||
    changed.some((path) => path !== manifestPath && !paths.includes(path)) ||
    !changed.some((path) => allowedPath.test(path))
  )
    reject();
  const files = paths.map((path) => {
    const entry = git("ls-tree", head, "--", path).toString();
    const match = /^(\d+) (blob) ([a-f0-9]{40})\t/.exec(entry);
    if (!match) reject();
    return {
      path,
      mode: match[1],
      type: match[2],
      bytes: git("cat-file", "blob", match[3]),
    };
  });
  return verifyPublication({
    envelope,
    publicKey: git(
      "show",
      `${base}:.github/editorial-publisher.pem`,
    ).toString(),
    baseHead: base,
    branch,
    files,
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = verifyCheckout({
      base: process.env.PUBLISH_BASE,
      head: process.env.PUBLISH_HEAD,
      branch: process.env.PUBLISH_BRANCH,
    });
    console.log(JSON.stringify({ ok: true, ...result }));
  } catch {
    console.error("editorial publication verification failed");
    process.exitCode = 1;
  }
}
