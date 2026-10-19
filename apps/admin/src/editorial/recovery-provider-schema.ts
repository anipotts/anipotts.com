import type { SqlRow } from "../../../../scripts/admin/editorial-recovery-capture.mjs";

// Exact native storage objects, not an application-prefix exemption. The KV
// rows and alarm are collected through Storage APIs; a D1 local bookmark belongs
// to its provider instance and is never imported into another database.
// workerd/util/sqlite-kv.c++, sqlite-metadata.c++; DO storage API documentation.
const native = {
  _cf_KV: "CREATE TABLE _cf_KV (key TEXT PRIMARY KEY,value BLOB) WITHOUT ROWID",
  __cf_kv:
    "CREATE TABLE __cf_kv (key TEXT PRIMARY KEY,value BLOB) WITHOUT ROWID",
  _cf_METADATA:
    "CREATE TABLE _cf_METADATA (key INTEGER PRIMARY KEY,value BLOB)",
} as const;
const normalize = (sql: string) =>
  sql.replace(/[\s;"`\[\]]/gu, "").toLowerCase();
export function isRecoveryProviderSchema(
  row: SqlRow,
  store: "editorial" | "content",
): boolean {
  const name = String(row.name);
  if (
    !Object.hasOwn(native, name) ||
    (name === "__cf_kv" && store !== "editorial")
  )
    return false;
  if (
    row.type !== "table" ||
    row.tbl_name !== name ||
    typeof row.sql !== "string" ||
    normalize(row.sql) !== normalize(native[name as keyof typeof native])
  )
    throw new Error("capture_provider_schema_drift");
  return true;
}
