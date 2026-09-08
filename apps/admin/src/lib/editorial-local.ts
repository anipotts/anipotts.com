import { Miniflare } from "miniflare";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { localGitHead } from "./local-git-head";
import type { DraftStorage, HomeBase } from "./editorial-home-api";
import {
  editorialRecordPath,
  type EditorialRecord,
} from "@anipotts/content/editorial/source";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
// Development only: same Workers implementation, persistent local SQLite, no remote bindings.
let runtime: Promise<Miniflare> | undefined;
export async function localDraftStorage(): Promise<DraftStorage> {
  runtime ??= (async () => {
    const bundle = await build({
      entryPoints: [
        fileURLToPath(new URL("../editorial/draft-store.ts", import.meta.url)),
      ],
      bundle: true,
      write: false,
      format: "esm",
      platform: "neutral",
      external: ["cloudflare:workers", "node:*"],
      define: { "import.meta.env.PUBLIC_RELEASE_SHA": '"dev"' },
      conditions: ["workerd", "import"],
    });
    return new Miniflare({
      modules: true,
      script: bundle.outputFiles[0]!.text,
      compatibilityDate: "2026-09-08",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: {
        EDITORIAL: { className: "EditorialDraftStore", useSQLite: true },
      },
      durableObjectsPersist: `${root}/.local/editorial-drafts`,
    });
  })();
  const { EDITORIAL } = await (
    await runtime
  ).getBindings<{
    EDITORIAL: {
      idFromName(name: string): string;
      get(id: string): DraftStorage;
    };
  }>();
  return EDITORIAL.get(EDITORIAL.idFromName("local-home"));
}
export async function localHomeBase(
  record: EditorialRecord = { kind: "page", id: "home" },
): Promise<HomeBase> {
  const path = `${root}/${editorialRecordPath(record)}`;
  const source = await readFile(path, "utf8");
  const baseCommit = await localGitHead(root);
  const bytes = Buffer.from(source);
  const baseFileHash = createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
  return { source, baseCommit, baseFileHash };
}
