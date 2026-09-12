import {
  applyActivityPage,
  emptyActivity,
  type ActivityWindow,
} from "./life-activity";
import {
  createUnconfiguredSnapshot,
  parseObservabilitySnapshot,
  type OperationalEvent,
} from "./observability-model";

/** Pure, read-only backfill projection. Cursor persistence belongs to the exporter,
 * never the PersonalContext writer or telemetry acknowledgement outbox. */
export async function projectPersonalContextActivity(
  page: unknown,
  previous: ActivityWindow = emptyActivity(),
  now = new Date(),
) {
  if (
    !page ||
    typeof page !== "object" ||
    Array.isArray(page) ||
    Object.keys(page).sort().join(",") !== "items,next_cursor"
  ) {
    throw new Error("Invalid operational activity page");
  }
  const activity = applyActivityPage(previous, page as Record<string, unknown>);
  const snapshot = createUnconfiguredSnapshot(now);
  snapshot.source = "live";
  snapshot.events = await Promise.all(
    activity.items.map(async (item) => {
      const instant = new Date(item.observed_at);
      if (instant.getTime() > now.getTime() || instant.getTime() < 0)
        throw new Error("Invalid operational activity timestamp");
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          `personal-context:${item.trace_id.toLowerCase()}:${item.change_id}`,
        ),
      );
      const evidenceId = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 32);
      return {
        serviceId: "personalcontext-ingestion",
        at: instant.toISOString(),
        kind: item.state === "failed" ? "failure" : "committed-checkpoint",
        evidenceId,
      } satisfies OperationalEvent;
    }),
  );
  // Historical commits establish checkpoint instrumentation, never present health,
  // running/idle state, a device contact timestamp, or measured execution duration.
  if (activity.items.length) {
    const service = snapshot.services.find(
      (item) => item.id === "personalcontext-ingestion",
    )!;
    service.instrumentation = "checkpoint";
    service.lastObservedAt = snapshot.events.reduce(
      (latest, item) => (item.at > latest ? item.at : latest),
      snapshot.events[0]!.at,
    );
  }
  return {
    activity,
    snapshot: parseObservabilitySnapshot(snapshot, now.getTime()),
  };
}
