import type { Draft } from "../editorial/draft-store";
import { projectEditorialInventory } from "./editorial-inventory-projection";

/** Compatibility helper; catalog and palette use the combined projection. */
export function privateWritingRecords(drafts: Draft[]) {
  return projectEditorialInventory([], drafts);
}
