import type { CatalogRecord } from "../components/astryx/EditorialApp";
import type { AdminSearchResult } from "../data/admin-search";
import type { EditorialInventoryStatus } from "./editorial-inventory-projection";

export type OverviewContentSnapshot = {
  content: CatalogRecord[];
  contentInventory: EditorialInventoryStatus;
  contentActivity: Array<{
    id: string;
    recordId?: string;
    title: string;
    href: string;
    collection: string;
    projectIdentity?: CatalogRecord["projectIdentity"];
    updated: NonNullable<CatalogRecord["updated"]>;
  }>;
  activityTruncated: boolean;
  searchEntries: AdminSearchResult[];
};
