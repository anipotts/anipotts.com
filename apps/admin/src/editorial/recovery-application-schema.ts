import { createHash } from "node:crypto";
import type { SqlRow } from "../../../../scripts/admin/editorial-recovery-capture.mjs";
import current from "./recovery-schema.json" with { type: "json" };
import historical from "./recovery-historical-schema.json" with { type: "json" };

/** Named-column restore accepts one explicitly recorded historical ALTER layout.
 * Every other object keeps its exact code-owned DDL fingerprint. Source DDL is
 * retained verbatim in the envelope; no source SQL is ever executed on restore. */
export function recoveryApplicationSchema(
  row: SqlRow,
  store: "editorial" | "content",
): string | null {
  const expected = (current[store] as Readonly<Record<string, string>>)[
    String(row.name)
  ];
  if (!expected) return null;
  const actual = createHash("sha256")
    .update(String(row.sql).replace(/\s+/g, " ").trim())
    .digest("hex");
  if (
    actual === expected ||
    (store === "editorial" &&
      row.name === "save_request_identities" &&
      actual === historical.save_request_identities.upgradedSha256)
  )
    return expected;
  throw new Error("capture_schema_drift");
}
