import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Match the ordered SQL inventory used by the publication migration ledger.
// Every browser run starts with an empty local database, so replay all files.
export function readPublicE2EMigrations(directory) {
  const names = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (names.length === 0) throw new Error("public e2e migrations are missing");
  return names
    .map((name) => readFileSync(join(directory, name), "utf8"))
    .join("\n");
}
