import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

/** Read-only local preview metadata. No dependency on Apple's developer tools. */
export async function localGitHead(root: string): Promise<string> {
  const marker = resolve(root, ".git");
  const metadata = await stat(marker);
  let directory = marker;
  if (!metadata.isDirectory()) {
    const text = await readFile(marker, "utf8");
    const match = /^gitdir: (.+)\r?\n?$/.exec(text);
    if (!match?.[1]) throw new Error("invalid_git_directory");
    directory = resolve(root, match[1]);
  }
  const head = (await readFile(resolve(directory, "HEAD"), "utf8")).trim();
  const hash = /^[a-f0-9]{40}$/;
  if (hash.test(head)) return head;
  const reference = head.startsWith("ref: ") ? head.slice(5) : "";
  if (
    !/^refs\/[A-Za-z0-9_./-]+$/.test(reference) ||
    reference.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("invalid_git_head");
  let common = directory;
  try {
    common = resolve(
      directory,
      (await readFile(resolve(directory, "commondir"), "utf8")).trim(),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  for (const base of new Set([directory, common])) {
    try {
      const value = (await readFile(resolve(base, reference), "utf8")).trim();
      if (!hash.test(value)) throw new Error("invalid_git_reference");
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const packed = await readFile(resolve(common, "packed-refs"), "utf8");
  const entry = packed
    .split(/\r?\n/)
    .find((line) => line.endsWith(` ${reference}`));
  const value = entry?.split(" ")[0];
  if (!value || !hash.test(value)) throw new Error("git_head_unavailable");
  return value;
}
