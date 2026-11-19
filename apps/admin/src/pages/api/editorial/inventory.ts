import type { APIRoute } from "astro";
import {
  inventoryFixture,
  loadEditorialInventory,
} from "../../../lib/editorial-inventory-server";
import { recentlyUpdated } from "../../../lib/editorial-recent-records";
import { privateJson } from "../../../lib/editorial-security";
import type { OverviewContentSnapshot } from "../../../lib/overview-inventory";
import { runtimeEnv } from "../../../lib/runtime-env";
import { measureServerTiming } from "../../../lib/server-timing";

const ACTIVITY_LIMIT = 100;

/** The editorial middleware requires the verified owner and sets private headers.
 * This read hydrates independently of the overview and other workspace readers. */
export const GET: APIRoute = async ({ locals, url }) => {
  try {
    const inventory = await measureServerTiming(locals, "inventory", () =>
      loadEditorialInventory(runtimeEnv(), inventoryFixture(url), "metadata"),
    );
    const records = recentlyUpdated(inventory.records);
    const dated = records.flatMap(
      ({ collection, id, title, href, updated, projectIdentity }) =>
        updated
          ? [
              {
                id: href,
                recordId: id,
                title,
                href,
                collection,
                updated,
                projectIdentity,
              },
            ]
          : [],
    );
    return privateJson({
      content: records
        .slice(0, 5)
        .map(
          ({
            title,
            href,
            status,
            id,
            projectIdentity,
            collection,
            section,
            changesPending,
            updated,
          }) => ({
            title,
            href,
            status,
            id,
            projectIdentity,
            collection,
            section,
            changesPending,
            updated,
          }),
        ),
      contentInventory: inventory.status,
      contentActivity: dated.slice(0, ACTIVITY_LIMIT),
      activityTruncated: dated.length > ACTIVITY_LIMIT,
      searchEntries: inventory.searchEntries,
    } satisfies OverviewContentSnapshot);
  } catch {
    return privateJson({ error: "inventory_unavailable" }, 503);
  }
};
